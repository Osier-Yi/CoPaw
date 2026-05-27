# -*- coding: utf-8 -*-
"""In-process pub/sub for pet events.

Two consumers want the same events:

* Local desktop on ``127.0.0.1:8765`` — still served by emitter's
  loopback ``POST /event`` (unchanged path).
* Remote desktops — subscribe via ``GET /api/qwenpaw-pet/events/stream``
  (SSE long-poll) from anywhere on the internet.

``publish`` is the single entry point both paths share. The hub keeps a
small ring buffer so a desktop reconnecting after a short blip can
replay events it missed via ``Last-Event-ID``.
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
from collections import deque
from copy import deepcopy
from typing import Any, AsyncIterator

logger = logging.getLogger("qwenpaw.pet_desktop")

# Per-subscriber queue depth. SSE is line-rate; if a client is so slow
# that 200 events queue up, dropping the oldest is the right call.
_QUEUE_MAX = 200

# How many recent events to remember for ``Last-Event-ID`` replay.
_RING_MAX = 256

# Seconds between SSE keepalive comments. Many corporate proxies/NATs
# silently drop idle TCP streams after 30-60 s — 15 s is well inside
# every common timeout.
HEARTBEAT_INTERVAL = 15.0


class _Subscriber:
    __slots__ = ("queue", "last_seen_id")

    def __init__(self) -> None:
        self.queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(
            maxsize=_QUEUE_MAX,
        )
        self.last_seen_id: int = 0


class EventHub:
    """Single-process pub/sub. Bound to one asyncio loop.

    ``start()`` records the running loop so synchronous callers (the
    emitter runs on whatever thread QwenPaw's lifecycle hook fires it
    from) can hand off via ``run_coroutine_threadsafe``.
    """

    def __init__(self) -> None:
        self._loop: asyncio.AbstractEventLoop | None = None
        self._subs: set[_Subscriber] = set()
        self._ring: deque[dict[str, Any]] = deque(maxlen=_RING_MAX)
        self._serial = 0
        self._lock = threading.RLock()
        self._closed = False

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Bind the hub to a running asyncio loop (from FastAPI startup)."""
        with self._lock:
            self._loop = loop
            self._closed = False

    def is_bound(self) -> bool:
        return self._loop is not None and not self._closed

    def publish(self, event: dict[str, Any]) -> None:
        """Thread-safe publish. Drops silently if no loop is bound yet."""
        with self._lock:
            self._serial += 1
            envelope = {
                "id": self._serial,
                "ts": int(time.time() * 1000),
                "data": deepcopy(event),
            }
            self._ring.append(envelope)
            loop = self._loop
            if loop is None or self._closed:
                # No SSE consumers yet — buffered in the ring for later
                # ``Last-Event-ID`` replay, even if nobody is connected.
                return
            subs = list(self._subs)

        if not subs:
            return

        def _fanout() -> None:
            for sub in subs:
                _enqueue_drop_oldest(sub.queue, envelope)

        try:
            loop.call_soon_threadsafe(_fanout)
        except RuntimeError:
            # Loop closed mid-publish (shutdown race). Not a hard error.
            logger.debug("hub publish dropped: loop closed", exc_info=True)

    async def subscribe(
        self,
        last_event_id: int | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Async iterator of envelopes. Replays missed events first.

        The caller is responsible for translating each envelope into an
        SSE frame and writing it to the response. We stay protocol-free
        here so non-HTTP consumers (tests, future websocket transport)
        could reuse the same hub.
        """
        if not self.is_bound():
            raise RuntimeError("hub not bound to a loop yet")

        sub = _Subscriber()
        with self._lock:
            self._subs.add(sub)
            replay = self._collect_replay(last_event_id)

        try:
            for envelope in replay:
                sub.last_seen_id = envelope["id"]
                yield envelope
            while True:
                envelope = await sub.queue.get()
                if envelope is _SENTINEL_CLOSE:
                    return
                sub.last_seen_id = envelope["id"]
                yield envelope
        finally:
            with self._lock:
                self._subs.discard(sub)

    def _collect_replay(
        self,
        last_event_id: int | None,
    ) -> list[dict[str, Any]]:
        if last_event_id is None or last_event_id <= 0:
            return []
        # ``deque`` doesn't index efficiently, but RING_MAX is small.
        return [e for e in self._ring if e["id"] > last_event_id]

    def subscriber_count(self) -> int:
        with self._lock:
            return len(self._subs)

    def close(self) -> None:
        """Tell all subscribers to drain and exit. Idempotent."""
        with self._lock:
            self._closed = True
            loop = self._loop
            subs = list(self._subs)
            self._subs.clear()
        if loop is None:
            return

        def _broadcast_close() -> None:
            for sub in subs:
                _enqueue_drop_oldest(sub.queue, _SENTINEL_CLOSE)

        try:
            loop.call_soon_threadsafe(_broadcast_close)
        except RuntimeError:
            pass


# Sentinel object pushed into per-sub queues to signal "drain and stop".
# Using a distinct object (not None / not a dict) avoids ambiguity with
# real envelopes.
_SENTINEL_CLOSE: dict[str, Any] = {"__sentinel__": "close"}


def _enqueue_drop_oldest(
    queue: asyncio.Queue[dict[str, Any]],
    item: dict[str, Any],
) -> None:
    """Put ``item``, evicting the oldest if the queue is full."""
    try:
        queue.put_nowait(item)
        return
    except asyncio.QueueFull:
        pass
    # Slow consumer: drop one to make room. Logged at debug because
    # one slow client should not spam server logs.
    try:
        queue.get_nowait()
    except asyncio.QueueEmpty:
        pass
    try:
        queue.put_nowait(item)
    except asyncio.QueueFull:
        logger.debug("hub: subscriber queue still full after eviction")


_hub_singleton: EventHub | None = None
_hub_lock = threading.Lock()


def get_hub() -> EventHub:
    """Return the process-wide hub (lazy singleton)."""
    global _hub_singleton
    with _hub_lock:
        if _hub_singleton is None:
            _hub_singleton = EventHub()
        return _hub_singleton


def publish(event: dict[str, Any]) -> None:
    """Shortcut used by the emitter (no need to grab the hub object)."""
    get_hub().publish(event)


def envelope_to_sse(envelope: dict[str, Any]) -> bytes:
    """Format an envelope as one SSE frame (with terminating blank line)."""
    data_json = json.dumps(envelope["data"], ensure_ascii=False)
    return (
        f"id: {envelope['id']}\n" f"event: pet\n" f"data: {data_json}\n\n"
    ).encode("utf-8")


def keepalive_frame() -> bytes:
    """SSE comment line — keeps proxies from idling the connection out."""
    return b": keepalive\n\n"
