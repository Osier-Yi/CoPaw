# -*- coding: utf-8 -*-
"""Scoped pairing tokens used by remote desktops to subscribe to SSE.

Pairing tokens are **separate** from QwenPaw's master API token:

* Master token: authenticates the browser console; can hit any plugin
  route (mode change, token issuance, etc.)
* Pairing token: only valid for ``GET /events/stream``. Issued from the
  browser, pasted into the desktop app, lives in ``~/.qwenpaw/`` next
  to the working dir so it follows QwenPaw's backups.

Tokens are stored **hashed** (sha256); the plaintext is shown to the
user exactly once at issuance time. Each entry tracks ``lastUsedAt`` so
the UI can render an "active devices" list and the user can revoke an
unused or compromised pairing without rotating their master credential.
"""

from __future__ import annotations

import hashlib
import logging
import os
import secrets
import threading
import time
from pathlib import Path
from typing import Any

from pet_paths import qwenpaw_working_dir

logger = logging.getLogger("qwenpaw.pet_desktop")

# How long a freshly issued token stays valid by default. 30 days is
# long enough that a typical "set up once, forget" user never re-pairs,
# yet short enough that an abandoned laptop loses access in a month.
_DEFAULT_TTL_DAYS = int(os.environ.get("QWENPAW_PET_PAIR_TTL_DAYS", "30"))

# Hard cap on simultaneously valid tokens — prevents a stuck issuance
# loop or a confused user from filling the file with dead entries.
_MAX_ACTIVE = 16

# Single writer at a time; the file is small and contention is low.
_LOCK = threading.RLock()


def tokens_path() -> Path:
    """Where the hashed-token table lives.

    Lives in QwenPaw's working dir (next to ``pets/``) so it follows
    the same backup/migration story as the rest of the QwenPaw state.
    """
    return qwenpaw_working_dir() / "qwenpaw-pet-pair-tokens.json"


def _hash(plaintext: str) -> str:
    return hashlib.sha256(plaintext.encode("utf-8")).hexdigest()


def _now_ms() -> int:
    return int(time.time() * 1000)


def _read_table() -> list[dict[str, Any]]:
    path = tokens_path()
    try:
        import json

        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw)
    except FileNotFoundError:
        return []
    except (OSError, ValueError):
        logger.warning("pair-tokens: failed to read %s; starting empty", path)
        return []
    if not isinstance(data, list):
        return []
    out: list[dict[str, Any]] = []
    for entry in data:
        if not isinstance(entry, dict):
            continue
        # Defensive subset — ignore unknown keys (forward-compat).
        id_ = entry.get("id")
        h = entry.get("hash")
        if not isinstance(id_, str) or not isinstance(h, str):
            continue
        out.append(entry)
    return out


def _write_table(entries: list[dict[str, Any]]) -> None:
    """Atomic-replace write."""
    import json

    path = tokens_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(
        json.dumps(entries, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    tmp.replace(path)
    try:
        # Restrict on POSIX so other local users cannot read tokens.
        # No effect on Windows; the file inherits the user's NTFS ACL.
        path.chmod(0o600)
    except OSError:
        pass


def _prune_expired(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    now = _now_ms()
    kept: list[dict[str, Any]] = []
    for e in entries:
        exp = e.get("expiresAt")
        if isinstance(exp, int) and 0 < exp <= now:
            continue
        kept.append(e)
    return kept


def issue_token(
    *,
    label: str | None = None,
    ttl_days: int | None = None,
) -> dict[str, Any]:
    """Mint a new pairing token. Returns ``{token, id, expiresAt, label}``.

    The ``token`` field is the **plaintext** — caller (UI) must show it
    exactly once; we only persist the sha256 hash.
    """
    ttl = ttl_days if ttl_days and ttl_days > 0 else _DEFAULT_TTL_DAYS
    plaintext = "ptoken_" + secrets.token_urlsafe(32)
    token_id = secrets.token_hex(6)
    now = _now_ms()
    expires_at = now + ttl * 86_400_000
    entry: dict[str, Any] = {
        "id": token_id,
        "hash": _hash(plaintext),
        "createdAt": now,
        "expiresAt": expires_at,
        "lastUsedAt": None,
        "label": (label or "").strip() or None,
    }

    with _LOCK:
        entries = _prune_expired(_read_table())
        if len(entries) >= _MAX_ACTIVE:
            # Drop the oldest unused one to make room. Better than 429
            # for normal users; they almost never have >16 pets.
            entries.sort(
                key=lambda e: (
                    e.get("lastUsedAt") or 0,
                    e.get("createdAt") or 0,
                ),
            )
            entries.pop(0)
        entries.append(entry)
        _write_table(entries)

    return {
        "token": plaintext,
        "id": token_id,
        "createdAt": now,
        "expiresAt": expires_at,
        "label": entry["label"],
    }


def list_tokens() -> list[dict[str, Any]]:
    """Return public metadata for every active token (no hashes)."""
    with _LOCK:
        entries = _prune_expired(_read_table())
        _write_table(entries)
    return [
        {
            "id": e["id"],
            "createdAt": e.get("createdAt"),
            "expiresAt": e.get("expiresAt"),
            "lastUsedAt": e.get("lastUsedAt"),
            "label": e.get("label"),
        }
        for e in entries
    ]


def revoke_token(token_id: str) -> bool:
    """Delete the token entry by id. Returns whether anything was removed."""
    token_id = (token_id or "").strip()
    if not token_id:
        return False
    with _LOCK:
        entries = _prune_expired(_read_table())
        keep = [e for e in entries if e.get("id") != token_id]
        if len(keep) == len(entries):
            return False
        _write_table(keep)
        return True


def revoke_all() -> int:
    with _LOCK:
        entries = _read_table()
        count = len(entries)
        _write_table([])
    return count


def revoke_by_plaintext(plaintext: str) -> str | None:
    """Look up a token by its plaintext and revoke the matching entry.

    Used by the ``DELETE /pair-token/self`` endpoint so the desktop can
    return its own token without having to remember the server-side
    ``id``. Returns the removed entry's id, or ``None`` if nothing
    matched (treat as already-revoked; idempotent on the caller side).
    """
    plaintext = (plaintext or "").strip()
    if not plaintext:
        return None
    h = _hash(plaintext)
    with _LOCK:
        entries = _prune_expired(_read_table())
        keep: list[dict[str, Any]] = []
        removed_id: str | None = None
        for e in entries:
            if removed_id is None and secrets.compare_digest(
                str(e.get("hash", "")),
                h,
            ):
                removed_id = str(e.get("id") or "")
                continue
            keep.append(e)
        if removed_id is None:
            return None
        _write_table(keep)
        return removed_id


def verify_token(
    plaintext: str,
    *,
    label_hint: str | None = None,
) -> dict[str, Any] | None:
    """Return the matching entry (and update ``lastUsedAt``), or ``None``.

    ``label_hint`` is an opportunistic relabel — desktop clients send
    their hostname on connect so the UI can show meaningful device
    names. Only fills in if the entry currently has no label.
    """
    plaintext = (plaintext or "").strip()
    if not plaintext:
        return None
    h = _hash(plaintext)
    now = _now_ms()
    with _LOCK:
        entries = _prune_expired(_read_table())
        match: dict[str, Any] | None = None
        for e in entries:
            if secrets.compare_digest(str(e.get("hash", "")), h):
                match = e
                break
        if match is None:
            _write_table(entries)
            return None
        match["lastUsedAt"] = now
        if label_hint and not match.get("label"):
            match["label"] = label_hint.strip() or None
        _write_table(entries)
        return {
            "id": match["id"],
            "createdAt": match.get("createdAt"),
            "expiresAt": match.get("expiresAt"),
            "lastUsedAt": match.get("lastUsedAt"),
            "label": match.get("label"),
        }
