# -*- coding: utf-8 -*-
"""Shared parser for ``qwenpaw-pet://pair?...`` deep links.

Used by both ``cli.py`` (terminal ``pair`` subcommand) and ``window.py``
(in-app "Paste pairing link" menu action) so they accept exactly the
same format.
"""

from __future__ import annotations

import base64
import binascii
import urllib.parse


def decode_pair_link(link: str) -> tuple[str, str]:
    """Parse ``qwenpaw-pet://pair?url=<b64u>&token=<...>&v=1``.

    The URL is base64url-encoded to avoid clashing with ``?``/``&``/``=``
    characters in deep cloud paths. Returns ``(url, token)`` or raises
    ``ValueError`` with a user-facing message.
    """
    parsed = urllib.parse.urlparse(link.strip())
    if parsed.scheme != "qwenpaw-pet":
        raise ValueError("pair link must start with 'qwenpaw-pet://'")
    if parsed.netloc not in ("pair", "") or (
        parsed.netloc == "" and parsed.path.strip("/") != "pair"
    ):
        raise ValueError("pair link host must be 'pair'")
    qs = urllib.parse.parse_qs(parsed.query, keep_blank_values=False)
    version = (qs.get("v") or ["1"])[0]
    if version != "1":
        raise ValueError(f"unsupported pair link version: {version}")
    url_b64 = (qs.get("url") or [""])[0]
    token = (qs.get("token") or [""])[0].strip()
    if not url_b64 or not token:
        raise ValueError("pair link is missing 'url' or 'token'")
    # base64url requires padding for ``urlsafe_b64decode``; the encoder
    # side may strip it, so pad defensively.
    padded = url_b64 + "=" * (-len(url_b64) % 4)
    try:
        url = base64.urlsafe_b64decode(padded).decode("utf-8").strip()
    except (binascii.Error, UnicodeDecodeError) as exc:
        raise ValueError(
            "pair link 'url' field is not valid base64url",
        ) from exc
    if not url.startswith("http://") and not url.startswith("https://"):
        raise ValueError("decoded url must be http(s)")
    return url.rstrip("/"), token
