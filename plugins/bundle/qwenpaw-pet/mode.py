# -*- coding: utf-8 -*-
"""Deployment mode resolution: local vs remote.

Precedence (highest first):

1. ``QWENPAW_PET_MODE`` env var — wins, locks the UI toggle.
2. ``~/.qwenpaw/qwenpaw-pet-config.json`` — user-controlled, written
   by the console sidebar's mode switcher.
3. Auto-detect — assume ``remote`` on a server that has no GUI session
   (typical for cloud ECS), ``local`` otherwise.

The hub + SSE endpoints are always available, regardless of mode. Mode
only changes:

* whether ``ensure_desktop_available`` tries to autostart a local pet
* what the console renders in the Pet sidebar
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Literal

from pet_paths import qwenpaw_working_dir

logger = logging.getLogger("qwenpaw.pet_desktop")

Mode = Literal["local", "remote"]
Source = Literal["env", "config", "auto"]

_VALID_MODES: tuple[Mode, ...] = ("local", "remote")
_ENV_VAR = "QWENPAW_PET_MODE"


def config_path() -> Path:
    return qwenpaw_working_dir() / "qwenpaw-pet-config.json"


def _normalize(raw: str | None) -> Mode | None:
    if not raw:
        return None
    v = raw.strip().lower()
    if v in _VALID_MODES:
        return v  # type: ignore[return-value]
    return None


def _read_config() -> Mode | None:
    try:
        data = json.loads(config_path().read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except (OSError, ValueError):
        logger.warning(
            "qwenpaw-pet-config.json unreadable; falling back to auto",
        )
        return None
    if not isinstance(data, dict):
        return None
    return _normalize(data.get("mode"))


def _auto_default() -> Mode:
    """Best-effort GUI detection.

    A cloud-deployed QwenPaw on Ubuntu/CentOS server has no display
    server, so spawning Qt would crash. Treat that case as ``remote``
    so the user instead gets the download/pair flow. On macOS and
    Windows we can always render a window — default to ``local``.
    """
    if sys.platform == "darwin":
        return "local"
    if sys.platform == "win32":
        return "local"
    # Linux / other: GUI iff one of the display env vars is set.
    if os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"):
        return "local"
    return "remote"


def resolve_mode() -> tuple[Mode, Source]:
    """Return ``(mode, source)`` — single source of truth for callers."""
    env_mode = _normalize(os.environ.get(_ENV_VAR))
    if env_mode is not None:
        return env_mode, "env"
    cfg_mode = _read_config()
    if cfg_mode is not None:
        return cfg_mode, "config"
    return _auto_default(), "auto"


def current_mode() -> Mode:
    """Shorthand when callers don't care about provenance."""
    return resolve_mode()[0]


def write_mode(mode: Mode) -> None:
    """Persist a new user choice. Raises ``ValueError`` for invalid input.

    Refuses to write when an env-var lock is in place — that way the
    UI's POST round-trip surfaces a clear "locked by env" error rather
    than silently appearing to succeed.
    """
    normalized = _normalize(mode)
    if normalized is None:
        raise ValueError(f"invalid mode: {mode!r}")
    if _normalize(os.environ.get(_ENV_VAR)) is not None:
        raise PermissionError(
            f"{_ENV_VAR} is set; unset the env var to change mode via UI",
        )

    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(
        json.dumps(
            {"mode": normalized, "updatedAt": int(time.time() * 1000)},
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    tmp.replace(path)
