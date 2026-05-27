# -*- coding: utf-8 -*-
"""SSE client: subscribe to a remote QwenPaw and feed events to the pet.

The pet desktop has two event sources:

* **Local mode** — emitter on the same machine ``POST``s to
  ``127.0.0.1:8765/event``. Path unchanged from the original design.
* **Remote mode** — this module opens a long-lived
  ``GET <cloud>/api/qwenpaw-pet/events/stream`` and pumps each event
  into the same in-process queue the local server feeds, so the rest
  of the desktop (sprite swaps, bubbles, tray) is oblivious to where
  the event came from.

Reconnect strategy: exponential backoff capped at 30 s. The server's
ring buffer remembers the last 256 events, so as long as we reconnect
within that window the ``Last-Event-ID`` cursor causes the server to
replay every event we missed during the blip.
"""

from __future__ import annotations

import json
import logging
import platform
import socket
import threading
from typing import Any, Callable

import httpx

from . import runtime

logger = logging.getLogger(__name__)

# Spec says SSE clients should reconnect after ~3s by default; we add
# exponential backoff so a server outage doesn't hammer the endpoint.
_BACKOFF_START = 1.0
_BACKOFF_CAP = 30.0

# How long httpx waits for the *connect* handshake. Read timeout must
# stay ``None`` — SSE keeps the socket open indefinitely.
_CONNECT_TIMEOUT = 10.0

# Connection-level health: detect a dead peer faster than the OS default.
# 30 s of idle → start probing; 3 probes × 10 s = ~60 s before giving up.
_TCP_KEEPIDLE = 30
_TCP_KEEPINTVL = 10
_TCP_KEEPCNT = 3


class _Backoff:
    def __init__(
        self,
        start: float = _BACKOFF_START,
        cap: float = _BACKOFF_CAP,
    ):
        self._start = start
        self._cap = cap
        self._next = start

    def next_delay(self) -> float:
        d = self._next
        self._next = min(self._next * 2, self._cap)
        return d

    def reset(self) -> None:
        self._next = self._start


class RemoteEventClient:
    """Consume SSE events from cloud QwenPaw and forward them locally.

    Designed to run in a daemon thread (``Thread(target=run_forever)``).
    Thread-safe stop via :meth:`stop`. The ``on_event`` callback is
    invoked from this thread — keep it cheap (the existing
    ``enqueue_pet_event`` is a simple ``SimpleQueue.put_nowait``).
    """

    def __init__(
        self,
        base_url: str,
        token: str,
        on_event: Callable[[dict[str, Any]], None],
        *,
        on_state: Callable[[str, str | None], None] | None = None,
        client_label: str | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._token = token
        self._on_event = on_event
        self._on_state = on_state or (lambda *_: None)
        self._client_label = client_label or _hostname_label()
        self._stop = threading.Event()
        self._backoff = _Backoff()

    # ----- lifecycle ---------------------------------------------------

    def stop(self) -> None:
        self._stop.set()

    def run_forever(self) -> None:
        """Blocking loop. Returns only after ``stop()`` has been called."""
        url = f"{self._base_url}/api/qwenpaw-pet/events/stream"
        while not self._stop.is_set():
            last_id = runtime.read_remote_cursor()
            try:
                self._on_state("connecting", None)
                self._connect_and_stream(url, last_id)
                # Connection ended cleanly — that's still "disconnected"
                # from the user's POV, retry after a beat.
                self._on_state("disconnected", None)
            except _AuthFailure as exc:
                # 401 means the pairing token was revoked. Stop trying
                # — the user must re-pair via the UI. Backing off
                # forever would just bury the real cause in the log.
                logger.warning(
                    "remote SSE auth rejected (%s); pausing client",
                    exc,
                )
                self._on_state("unauthorized", str(exc))
                return
            except Exception as exc:  # noqa: BLE001 — top-level guard
                logger.warning("remote SSE disconnected: %s", exc)
                self._on_state("disconnected", str(exc))

            if self._stop.is_set():
                break
            delay = self._backoff.next_delay()
            logger.info("remote SSE will reconnect in %.1fs", delay)
            # ``Event.wait`` returns True when ``stop()`` is called,
            # giving us an immediate, sleep-free shutdown path.
            if self._stop.wait(delay):
                break

    # ----- internals ---------------------------------------------------

    def _headers(self) -> dict[str, str]:
        h = {
            "Authorization": f"Bearer {self._token}",
            "Accept": "text/event-stream",
            "Cache-Control": "no-cache",
        }
        if self._client_label:
            h["X-QwenPaw-Pet-Client-Label"] = self._client_label
        return h

    def _connect_and_stream(self, url: str, last_id: int | None) -> None:
        headers = self._headers()
        if last_id is not None:
            headers["Last-Event-ID"] = str(last_id)

        # ``read=None`` is critical: an SSE stream is idle by design;
        # any read timeout would kill it during quiet periods.
        timeout = httpx.Timeout(None, connect=_CONNECT_TIMEOUT)

        # ``trust_env=True`` so corporate HTTPS_PROXY (Clash on 7890,
        # company MITM gateway) is respected — without it the user has
        # to special-case the env to make remote mode work behind a
        # proxy. Local-loopback callers in ``emitter.py`` use
        # ``trust_env=False`` for the opposite reason.
        transport = httpx.HTTPTransport(
            retries=0,
            socket_options=_keepalive_socket_options(),
        )
        with httpx.Client(
            transport=transport,
            trust_env=True,
            timeout=timeout,
        ) as client:
            with client.stream("GET", url, headers=headers) as response:
                if response.status_code in (401, 403):
                    raise _AuthFailure(
                        f"server returned {response.status_code}",
                    )
                response.raise_for_status()
                self._backoff.reset()
                self._on_state("connected", None)
                self._consume(response)

    def _consume(self, response: httpx.Response) -> None:
        """Drain SSE frames until the stream ends or ``stop()`` fires."""
        current_id: int | None = None
        data_lines: list[str] = []
        event_name: str | None = None

        for raw in response.iter_lines():
            if self._stop.is_set():
                return
            # ``iter_lines`` may yield ``bytes`` on some httpx versions;
            # normalise so the parser below can work in str.
            if isinstance(raw, bytes):
                line = raw.decode("utf-8", errors="replace")
            else:
                line = raw

            if line == "":
                # Blank line = end of one SSE event.
                if data_lines:
                    self._dispatch(
                        event_name,
                        current_id,
                        "\n".join(data_lines),
                    )
                current_id = None
                data_lines = []
                event_name = None
                continue
            if line.startswith(":"):
                # SSE comment (our heartbeat). Quietly drop.
                continue
            field, _, value = line.partition(":")
            if value.startswith(" "):
                value = value[1:]
            if field == "id":
                try:
                    current_id = int(value)
                except ValueError:
                    current_id = None
            elif field == "event":
                event_name = value
            elif field == "data":
                data_lines.append(value)
            # ``retry:`` field is ignored — our backoff is local policy.

    def _dispatch(
        self,
        event_name: str | None,
        event_id: int | None,
        data: str,
    ) -> None:
        # Advance the cursor regardless of payload validity — replaying
        # a malformed event will fail the same way next time, and
        # leaving the cursor pinned would force the server to re-send
        # everything forever on reconnect.
        try:
            payload = json.loads(data)
        except json.JSONDecodeError:
            logger.warning(
                "remote SSE: malformed JSON (event=%s id=%s)",
                event_name,
                event_id,
            )
            payload = None
        if isinstance(payload, dict):
            try:
                self._on_event(payload)
            except Exception:
                logger.exception("remote SSE: on_event handler failed")
        if event_id is not None:
            try:
                runtime.write_remote_cursor(event_id)
            except OSError:
                logger.debug("remote SSE: cursor write failed", exc_info=True)


# ----- helpers -------------------------------------------------------------


class _AuthFailure(RuntimeError):
    """Raised when the server rejects our pairing token (401/403)."""


def _hostname_label() -> str:
    """Best-effort device label sent in the connect headers.

    The cloud UI shows this in the "paired devices" list so a user
    with several laptops can tell them apart and revoke one without
    nuking the rest. Falls back to ``platform.node()`` then ``unknown``.
    """
    for fn in (socket.gethostname, platform.node):
        try:
            name = fn()
        except OSError:
            continue
        if name:
            return name.strip()[:64]
    return "unknown"


def _keepalive_socket_options() -> list[tuple[int, int, int]]:
    """Per-platform TCP keepalive — fights silent NAT/proxy timeouts."""
    opts: list[tuple[int, int, int]] = [
        (socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1),
    ]
    # Linux exposes the timing knobs as TCP-level opts. On macOS the
    # constants live under different names (``TCP_KEEPALIVE`` is the
    # only one and it's seconds-to-first-probe); on Windows the OS
    # defaults are reasonable and the per-socket overrides require
    # ``WSAIoctl``, which httpx doesn't expose. Best-effort all round.
    if hasattr(socket, "TCP_KEEPIDLE"):
        opts.append((socket.IPPROTO_TCP, socket.TCP_KEEPIDLE, _TCP_KEEPIDLE))
    if hasattr(socket, "TCP_KEEPINTVL"):
        opts.append((socket.IPPROTO_TCP, socket.TCP_KEEPINTVL, _TCP_KEEPINTVL))
    if hasattr(socket, "TCP_KEEPCNT"):
        opts.append((socket.IPPROTO_TCP, socket.TCP_KEEPCNT, _TCP_KEEPCNT))
    return opts
