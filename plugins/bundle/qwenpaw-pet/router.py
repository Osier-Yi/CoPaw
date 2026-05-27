# -*- coding: utf-8 -*-
"""QwenPaw plugin HTTP routes."""

from __future__ import annotations

import asyncio
import json
import mimetypes
import re
import shutil
import tempfile
import zipfile
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, model_validator

import mode as mode_mod
import pair_tokens
from emitter import (
    desktop_status_summary,
    emit_pet_event,
    start_desktop_interactive,
    switch_pet_desktop,
)
from event_hub import (
    HEARTBEAT_INTERVAL,
    envelope_to_sse,
    get_hub,
    keepalive_frame,
)
from pet_paths import list_installed_pets, pets_install_dir


class SwitchPetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pet_dir: str | None = None
    pet_id: str | None = None

    @model_validator(mode="after")
    def _one_target(self) -> SwitchPetRequest:
        d = (self.pet_dir or "").strip()
        i = (self.pet_id or "").strip()
        if bool(d) == bool(i):
            raise ValueError("provide exactly one of pet_dir or pet_id")
        return self


class EmitPayload(BaseModel):
    event: str
    text: str | None = None
    state: str | None = None
    duration_ms: int | None = None


class ModeUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: str


class PairTokenCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str | None = None
    ttl_days: int | None = None


_PAIR_TOKEN_ID = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


class ImportPetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Absolute path to either:
    #   * a folder containing ``pet.json`` + ``spritesheet.webp``, or
    #   * a ``.zip`` whose top level (or single nested folder) contains
    #     ``pet.json`` + ``spritesheet.webp``.
    path: str
    # Overwrite an already-installed pet with the same id.
    replace: bool = True


_SAFE_PET_FOLDER = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$")
# Used to validate the pet id we derive from pet.json / the source folder
# before it becomes a directory under ``<WORKING_DIR>/pets/`` — keeps an
# untrusted manifest from creating ``../etc/foo`` etc.
_SAFE_PET_ID = _SAFE_PET_FOLDER


def _safe_extract_zip(zip_path: Path, dest: Path) -> None:
    """Extract *zip_path* into *dest*, rejecting any entry that escapes it.

    Guards against zip-slip: every member's resolved path must stay
    under ``dest``. Windows-style backslashes are normalised before the
    check so cross-platform archives behave the same way.
    """
    dest_resolved = dest.resolve()
    with zipfile.ZipFile(zip_path) as zf:
        for info in zf.infolist():
            name = info.filename.replace("\\", "/")
            parts = Path(name).parts
            if name.startswith("/") or ".." in parts:
                raise HTTPException(
                    status_code=400,
                    detail=f"unsafe zip entry: {info.filename}",
                )
            target = (dest_resolved / name).resolve()
            try:
                target.relative_to(dest_resolved)
            except ValueError as exc:
                raise HTTPException(
                    status_code=400,
                    detail=f"zip entry escapes target: {info.filename}",
                ) from exc
        zf.extractall(dest_resolved)


def _resolve_pet_source(extracted: Path) -> Path:
    """Locate the pet package root inside an unpacked directory.

    Supports two layouts so both ``zip -r foo.zip pet-dir/`` and Finder's
    "Compress" produce a usable archive:

    1. ``<extracted>/pet.json``                — flat archive
    2. ``<extracted>/<single subdir>/pet.json`` — nested in one folder
    """
    if (extracted / "pet.json").is_file():
        return extracted
    children = [p for p in extracted.iterdir() if p.is_dir()]
    if len(children) == 1 and (children[0] / "pet.json").is_file():
        return children[0]
    raise HTTPException(
        status_code=400,
        detail="pet package must contain pet.json at its root",
    )


def _install_from_source(source: Path, *, replace: bool) -> dict[str, object]:
    """Validate ``source`` as a pet package and install it.

    Common tail shared by every import path (JSON ``path`` body and
    multipart upload). Returns the JSON response payload; raises
    ``HTTPException`` for any user-visible failure.
    """
    # Lazy import: pulls Pillow + the desktop runtime package only for
    # callers that actually import a pet.
    from qwenpaw_pet_desktop import pet_package

    try:
        manifest, _sheet = pet_package.validate_pet_package(source)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    pet_id = str(manifest.get("id") or source.name)
    if not _SAFE_PET_ID.fullmatch(pet_id):
        raise HTTPException(
            status_code=400,
            detail=(
                f"pet id {pet_id!r} is not a safe folder name "
                "(letters, digits, '.', '_', '-' only)"
            ),
        )

    try:
        target = pet_package.install_pet(source, replace=replace)
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    return {
        "ok": True,
        "petId": pet_id,
        "path": str(target),
        "displayName": str(
            manifest.get("displayName") or manifest.get("name") or pet_id,
        ),
    }


def _safe_join(root: Path, relative: str) -> Path:
    """Resolve ``relative`` under ``root`` rejecting any escape attempt.

    Normalises ``\\`` to ``/`` so cross-platform multipart uploads (the
    browser sends ``webkitRelativePath`` with forward slashes; Windows
    archivers occasionally use backslashes) all land in the same tree.
    """
    name = relative.replace("\\", "/").strip()
    if not name:
        raise HTTPException(status_code=400, detail="upload entry has no name")
    parts = Path(name).parts
    if name.startswith("/") or ".." in parts:
        raise HTTPException(
            status_code=400,
            detail=f"unsafe upload entry: {relative}",
        )
    root_r = root.resolve()
    dest = (root_r / name).resolve()
    try:
        dest.relative_to(root_r)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"upload entry escapes target: {relative}",
        ) from exc
    return dest


def _resolved_pet_spritesheet_path(folder: str) -> Path:
    """Return spritesheet path for ``pets/<folder>`` or raise HTTPException."""
    if not _SAFE_PET_FOLDER.fullmatch(folder):
        raise HTTPException(status_code=400, detail="invalid pet folder name")
    root = pets_install_dir().resolve()
    pet_dir = (root / folder).resolve()
    try:
        pet_dir.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="pet not found") from exc
    if not pet_dir.is_dir():
        raise HTTPException(status_code=404, detail="pet not found")
    manifest_path = pet_dir / "pet.json"
    if not manifest_path.is_file():
        raise HTTPException(status_code=404, detail="missing pet.json")
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        # The manifest came in via ``/import-pet`` / ``/import-pet-upload``
        # — so a malformed ``pet.json`` is client-supplied data, not a
        # server-internal fault. Return 400 instead of 500 so the
        # console can surface the right message to the user.
        raise HTTPException(
            status_code=400,
            detail="invalid pet.json",
        ) from exc
    except OSError as exc:
        # The ``is_file()`` check above raced with a concurrent delete
        # or the file became unreadable: that *is* a server-side I/O
        # failure, so 500 is the correct code.
        raise HTTPException(
            status_code=500,
            detail=f"failed to read pet.json: {exc}",
        ) from exc
    rel = data.get("spritesheetPath")
    if not isinstance(rel, str) or not rel.strip():
        raise HTTPException(status_code=404, detail="missing spritesheetPath")
    sheet = (pet_dir / rel).resolve()
    try:
        sheet.relative_to(pet_dir)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail="invalid spritesheet path",
        ) from exc
    if not sheet.is_file():
        raise HTTPException(status_code=404, detail="spritesheet file missing")
    return sheet


def _extract_pairing_token(request: Request) -> str | None:
    """Pull the pairing token from header or query, preferring the header.

    Browsers cannot set headers on ``EventSource``, but the desktop
    client uses ``httpx.stream`` which can — we always read the header
    first to keep credentials out of access logs. Query-string fallback
    exists only for hand-curl debugging.
    """
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip() or None
    direct = request.headers.get("x-qwenpaw-pet-pair-token")
    if direct:
        return direct.strip() or None
    qp = request.query_params.get("token")
    if qp:
        return qp.strip() or None
    return None


def _parse_last_event_id(request: Request) -> int | None:
    raw = request.headers.get("last-event-id") or request.query_params.get(
        "last_event_id",
    )
    if not raw:
        return None
    try:
        v = int(raw)
    except ValueError:
        return None
    return v if v > 0 else None


def build_router() -> APIRouter:  # pylint: disable=too-many-statements
    # FastAPI route builders are inherently statement-dense (one decorator
    # + body per endpoint). Splitting by concern is possible but would
    # spray closure state across helpers without clarifying anything.
    router = APIRouter()

    @router.get("/status")
    def status():
        m, src = mode_mod.resolve_mode()
        return {
            "ok": True,
            "plugin": "qwenpaw-pet",
            "mode": m,
            "modeSource": src,
            "desktop": desktop_status_summary(),
        }

    @router.get("/mode")
    def mode_get():
        m, src = mode_mod.resolve_mode()
        return {"ok": True, "mode": m, "source": src}

    @router.post("/mode")
    def mode_set(payload: ModeUpdateRequest):
        try:
            mode_mod.write_mode(payload.mode)  # type: ignore[arg-type]
        except PermissionError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        m, src = mode_mod.resolve_mode()
        return {"ok": True, "mode": m, "source": src}

    @router.get("/pair-token")
    def pair_token_list():
        return {"ok": True, "tokens": pair_tokens.list_tokens()}

    @router.post("/pair-token")
    def pair_token_create(payload: PairTokenCreateRequest):
        info = pair_tokens.issue_token(
            label=payload.label,
            ttl_days=payload.ttl_days,
        )
        # ``token`` is plaintext and only ever returned here — UI must
        # treat the response as a one-shot reveal.
        return {"ok": True, **info}

    @router.delete("/pair-token/self")
    def pair_token_delete_self(request: Request):
        """Desktop self-revoke: 'I am leaving, forget my token'.

        Authenticated by the pairing token itself (bearer header) so the
        desktop does not need to remember the server-side ``id``. The
        endpoint is idempotent — a missing entry returns 200 so a
        desktop that retries after a flaky network won't surface a
        spurious error.
        """
        plaintext = _extract_pairing_token(request)
        if not plaintext:
            raise HTTPException(
                status_code=401,
                detail="missing pairing token",
            )
        removed_id = pair_tokens.revoke_by_plaintext(plaintext)
        return {"ok": True, "revoked": removed_id}

    # Must be registered AFTER the literal ``/self`` route — FastAPI
    # matches in registration order, and ``self`` would otherwise
    # collide with the ``{token_id}`` placeholder regex.
    @router.delete("/pair-token/{token_id}")
    def pair_token_delete(token_id: str):
        if not _PAIR_TOKEN_ID.fullmatch(token_id):
            raise HTTPException(status_code=400, detail="invalid token id")
        removed = pair_tokens.revoke_token(token_id)
        if not removed:
            raise HTTPException(status_code=404, detail="token not found")
        return {"ok": True, "revoked": token_id}

    @router.get("/events/stream")
    async def events_stream(request: Request):
        """SSE long-poll for remote desktops.

        Auth: pairing token only (master token would not survive the
        ``Authorization`` bounce through QwenPaw's middleware, and a
        scoped credential is the right shape for a long-running
        subscription anyway).
        """
        plaintext = _extract_pairing_token(request)
        if not plaintext:
            raise HTTPException(
                status_code=401,
                detail="pairing token required",
            )
        label_hint = request.headers.get("x-qwenpaw-pet-client-label")
        verified = pair_tokens.verify_token(plaintext, label_hint=label_hint)
        if verified is None:
            raise HTTPException(
                status_code=401,
                detail="invalid or expired pairing token",
            )

        hub = get_hub()
        if not hub.is_bound():
            # FastAPI calls async endpoints from the request loop —
            # bind here so ``publish`` from any thread can reach us.
            hub.bind_loop(asyncio.get_running_loop())

        last_id = _parse_last_event_id(request)

        async def _generator():
            # First frame is a keepalive comment so the client knows
            # the stream is alive even before the first real event.
            yield keepalive_frame()
            agen = hub.subscribe(last_event_id=last_id)
            try:
                while True:
                    try:
                        envelope = await asyncio.wait_for(
                            agen.__anext__(),
                            timeout=HEARTBEAT_INTERVAL,
                        )
                    except asyncio.TimeoutError:
                        if await request.is_disconnected():
                            return
                        yield keepalive_frame()
                        continue
                    except StopAsyncIteration:
                        return
                    yield envelope_to_sse(envelope)
            finally:
                # Async-generator ``aclose`` runs the body's ``finally``,
                # which is what removes the subscriber from the hub —
                # otherwise a client disconnect would leak a queue.
                await agen.aclose()

        headers = {
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",  # disable nginx buffering
            "Connection": "keep-alive",
        }
        return StreamingResponse(
            _generator(),
            media_type="text/event-stream",
            headers=headers,
        )

    @router.get("/desktop/info")
    def desktop_info():
        m, src = mode_mod.resolve_mode()
        return {
            "ok": True,
            "mode": m,
            "modeSource": src,
            "subscribers": get_hub().subscriber_count(),
        }

    @router.get("/pets")
    def list_pets():
        return {
            "ok": True,
            "petsDir": str(pets_install_dir()),
            "pets": list_installed_pets(),
        }

    @router.get("/pets/{folder}/spritesheet")
    def pet_spritesheet(folder: str):
        """Serve the raw spritesheet image for console previews.

        Auth via the QwenPaw API.
        """
        sheet = _resolved_pet_spritesheet_path(folder)
        media_type, _ = mimetypes.guess_type(str(sheet))
        if not media_type:
            media_type = "application/octet-stream"
        return FileResponse(sheet, media_type=media_type)

    @router.post("/desktop/start")
    def desktop_start():
        return start_desktop_interactive()

    @router.post("/emit-test")
    def emit_test(payload: EmitPayload):
        emit_pet_event(
            payload.event,
            text=payload.text,
            state=payload.state,
            duration_ms=payload.duration_ms,
            manual=True,
        )
        return {"ok": True}

    @router.post("/switch-pet")
    def switch_pet_route(payload: SwitchPetRequest):
        return switch_pet_desktop(
            pet_dir=payload.pet_dir,
            pet_id=payload.pet_id,
        )

    @router.post("/import-pet")
    def import_pet(payload: ImportPetRequest):
        """Install a pet from a *local* folder or ``.zip`` archive.

        Programmatic / CLI path: the file must already exist on the
        server's filesystem. For browser uploads use
        ``/import-pet-upload`` instead.
        """
        raw = (payload.path or "").strip()
        if not raw:
            raise HTTPException(status_code=400, detail="path is required")
        src = Path(raw).expanduser()
        if not src.is_absolute():
            raise HTTPException(
                status_code=400,
                detail="path must be absolute",
            )
        src = src.resolve()
        if not src.exists():
            raise HTTPException(
                status_code=404,
                detail=f"path not found: {src}",
            )

        tmp_root: Path | None = None
        try:
            if src.is_dir():
                source_dir = src
            elif src.is_file() and src.suffix.lower() == ".zip":
                tmp_root = Path(
                    tempfile.mkdtemp(prefix="qwenpaw-pet-import-"),
                )
                _safe_extract_zip(src, tmp_root)
                source_dir = _resolve_pet_source(tmp_root)
            else:
                raise HTTPException(
                    status_code=400,
                    detail="path must be a directory or a .zip file",
                )
            return _install_from_source(source_dir, replace=payload.replace)
        finally:
            if tmp_root is not None:
                shutil.rmtree(tmp_root, ignore_errors=True)

    @router.post("/import-pet-upload")
    def import_pet_upload(
        files: list[UploadFile] = File(...),
        replace: bool = Form(True),
    ):
        """Install a pet from a multipart upload (browser Dropzone).

        Declared as a **synchronous** route so FastAPI runs it in a
        thread pool — the tempdir writes and ``shutil.copyfileobj``
        would otherwise block the ASGI event loop on large uploads.

        Two upload shapes are supported:

        * **Single ``.zip``** — when exactly one file is uploaded and
          its name ends with ``.zip``, the archive is extracted in a
          tempdir (with zip-slip protection) and the resulting layout
          handled like ``/import-pet``.
        * **Folder upload** — when multiple files are uploaded, each
          file's name (typically ``webkitRelativePath`` set by the
          browser when a directory is dropped) is treated as a path
          relative to a tempdir; the resulting directory is then
          installed.

        The ``replace`` form field accepts the usual truthy strings
        (``true``, ``1``, ``yes``, ``on``).
        """
        if not files:
            raise HTTPException(
                status_code=400,
                detail="no files uploaded",
            )

        tmp_root = Path(tempfile.mkdtemp(prefix="qwenpaw-pet-upload-"))
        extract_root: Path | None = None
        try:
            for uf in files:
                dest = _safe_join(tmp_root, uf.filename or "")
                dest.parent.mkdir(parents=True, exist_ok=True)
                with dest.open("wb") as out:
                    shutil.copyfileobj(uf.file, out)

            children = list(tmp_root.iterdir())
            single_zip = (
                len(children) == 1
                and children[0].is_file()
                and children[0].suffix.lower() == ".zip"
            )
            if single_zip:
                extract_root = Path(
                    tempfile.mkdtemp(prefix="qwenpaw-pet-upload-zip-"),
                )
                _safe_extract_zip(children[0], extract_root)
                source_dir = _resolve_pet_source(extract_root)
            else:
                source_dir = _resolve_pet_source(tmp_root)

            return _install_from_source(source_dir, replace=replace)
        finally:
            shutil.rmtree(tmp_root, ignore_errors=True)
            if extract_root is not None:
                shutil.rmtree(extract_root, ignore_errors=True)

    return router
