# -*- coding: utf-8 -*-
"""QwenPaw community integration endpoints."""

from __future__ import annotations

import asyncio
import base64
import re
from typing import Any, Literal
from urllib.parse import quote, parse_qs, urlsplit

import httpx
from markdown_it import MarkdownIt
from fastapi import APIRouter, HTTPException, Request, Query, Path
from pydantic import BaseModel, Field

from .community_connection import get_service, _call
from ..community_connection import CommunityConnectionError
from ..community_report import ReportScreenshot

from ..community_feedback import FeedbackLinkError, resolve_feedback_link
from ...installation_origin import InstallationOrigin

router = APIRouter(prefix="/community", tags=["community"])


class FeedbackLinkRequest(BaseModel):
    origin: InstallationOrigin


@router.post("/feedback-link")
async def feedback_link(body: FeedbackLinkRequest) -> dict[str, str]:
    """Return the community question page for one exact installed resource."""
    try:
        async with httpx.AsyncClient(
            timeout=15,
            follow_redirects=False,
        ) as client:
            url = await resolve_feedback_link(body.origin.model_dump(), client)
        return {"url": url}
    except FeedbackLinkError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        status = 404 if exc.response.status_code == 404 else 502
        raise HTTPException(
            status_code=status,
            detail="The community resource is unavailable. Please try again.",
        ) from exc
    except (httpx.RequestError, ValueError) as exc:
        raise HTTPException(
            status_code=502,
            detail="Could not reach the community. Please try again.",
        ) from exc


@router.get("/posts")
async def community_posts(
    request: Request,
    page: int = Query(1, ge=1, le=10000),
    keyword: str = Query("", max_length=200),
    post_type: Literal[
        "all",
        "article",
        "question",
        "work_share",
        "app_case",
        "beginner_tutorial",
        "discussion",
        "official_announcement",
    ] = "all",
    sort: Literal["latest", "recommended"] = "recommended",
):
    return await _call(
        get_service(request).community_request(
            "GET",
            "/api/v1/community/articles",
            params={
                "page": page,
                "page_size": 20,
                "keyword": keyword,
                "type": post_type,
                "sort": sort,
            },
        ),
    )


@router.get("/posts/{post_id}")
async def community_post(
    request: Request,
    post_id: str = Path(pattern=r"^[A-Za-z0-9_-]{1,128}$"),
):
    return await _call(
        get_service(request).community_request(
            "GET",
            f"/api/v1/community/articles/{post_id}",
        ),
    )


@router.get("/posts/{post_id}/comments")
async def community_comments(
    request: Request,
    post_id: str = Path(pattern=r"^[A-Za-z0-9_-]{1,128}$"),
    page: int = Query(1, ge=1, le=10000),
):
    return await _call(
        get_service(request).community_request(
            "GET",
            f"/api/v1/community/articles/{post_id}/comments",
            params={"page": page, "page_size": 20},
        ),
    )


class CommunityCommentRequest(BaseModel):
    content: str = Field(min_length=1, max_length=65536)
    parent_id: str | None = Field(
        default=None,
        pattern=r"^[A-Za-z0-9_-]{1,128}$",
    )
    account_id: str = Field(min_length=1, max_length=128)


@router.post("/posts/{post_id}/comments")
async def post_community_comment(
    body: CommunityCommentRequest,
    request: Request,
    post_id: str = Path(pattern=r"^[A-Za-z0-9_-]{1,128}$"),
):
    if not body.content.strip():
        raise HTTPException(status_code=422, detail="empty_comment")
    return await _call(
        get_service(request).community_request(
            "POST",
            f"/api/v1/community/articles/{post_id}/comments",
            account_id=body.account_id,
            json={
                "content": body.content,
                "parent_id": body.parent_id,
                "kind": "comment",
            },
        ),
    )


@router.get("/posts/{post_id}/resources")
async def community_post_resources(
    request: Request,
    post_id: str = Path(pattern=r"^[A-Za-z0-9_-]{1,128}$"),
):
    """Resolve all Skill/Plugin links from the current post."""
    service = get_service(request)
    post = await _call(
        service.community_request(
            "GET",
            f"/api/v1/community/articles/{post_id}",
        ),
    )
    resources = []
    seen = set()
    for kind, field in (
        ("skill", "related_skill_ids"),
        ("plugin", "related_plugin_ids"),
    ):
        for identifier in post.get(field) or []:
            if not isinstance(identifier, str) or not identifier:
                continue
            key = (kind, identifier)
            if key in seen:
                continue
            seen.add(key)
            encoded = quote(identifier, safe="")
            collection = "skills" if kind == "skill" else "plugins"
            name = identifier
            try:
                detail = await service.community_request(
                    "GET",
                    f"/api/v1/{collection}/{encoded}",
                )
                name = (
                    detail.get("skill_code" if kind == "skill" else "name")
                    or identifier
                )
            except CommunityConnectionError:
                # Keep the exact association even if its display name fails.
                pass
            resources.append(
                {
                    "id": identifier,
                    "type": kind,
                    "name": str(name),
                    "url": f"https://platform.agentscope.io/"
                    f"{collection}/{encoded}",
                },
            )
    return {"resources": resources}


class CommunityImageRequest(ReportScreenshot):
    account_id: str = Field(min_length=1, max_length=128)
    reviewed: bool = False


@router.post("/media")
async def upload_community_image(
    body: CommunityImageRequest,
    request: Request,
):
    """Upload only a masked image explicitly approved for public use."""
    if not body.reviewed:
        raise HTTPException(status_code=422, detail="image_not_reviewed")
    header, encoded = body.data_url.split(",", 1)
    mime = header[5:].split(";", 1)[0]
    extension = mime.split("/", 1)[1]
    result = await _call(
        get_service(request).community_request(
            "POST",
            "/api/v1/community/media",
            account_id=body.account_id,
            params={"purpose": "body"},
            files={
                "file": (
                    f"screenshot.{extension}",
                    base64.b64decode(encoded),
                    mime,
                ),
            },
        ),
    )
    url = result.get("url", "")
    identifier = result.get("media_id")
    if (
        not _valid_media_url(url)
        or not isinstance(identifier, str)
        or not identifier
    ):
        raise HTTPException(
            status_code=502,
            detail="invalid_platform_response",
        )
    return {"url": url, "media_id": identifier}


def _valid_media_url(url: Any) -> bool:
    if not isinstance(url, str):
        return False
    try:
        parsed = urlsplit(url)
    except ValueError:
        return False
    return (
        parsed.scheme == "https"
        and bool(parsed.netloc)
        and not parsed.username
        and not parsed.password
        and not re.search(r'[\s<>"()]', url)
    )


def _post_html(content: str) -> str:
    """Render Markdown for Platform without accepting raw HTML."""
    return MarkdownIt("commonmark", {"html": False, "breaks": True}).render(
        content,
    )


class CommunityPostRequest(BaseModel):
    title: str = Field(min_length=1, max_length=256)
    content: str = Field(min_length=1, max_length=65536)
    article_type: Literal[
        "question",
        "work_share",
        "app_case",
        "beginner_tutorial",
        "discussion",
    ] = "question"
    account_id: str = Field(min_length=1, max_length=128)
    media_ids: list[str] = Field(default_factory=list, max_length=20)
    origin: InstallationOrigin | None = None
    origins: list[InstallationOrigin] = Field(
        default_factory=list,
        max_length=6,
    )


@router.post("/posts")
async def publish_community_post(body: CommunityPostRequest, request: Request):
    """Publish only an explicit user submission under the connected account."""
    if not body.title.strip() or not body.content.strip():
        raise HTTPException(status_code=422, detail="empty_post")
    service = get_service(request)
    status = await _call(service.status(local=False))
    if not status.get("account") or status["account"]["id"] != body.account_id:
        raise HTTPException(status_code=409, detail="community_login_required")
    payload: dict[str, Any] = {
        "title": body.title.strip(),
        "body_text": body.content,
        "body_html": _post_html(body.content),
        "media_ids": body.media_ids,
        "article_type": body.article_type,
        "related_skill_ids": [],
        "related_plugin_ids": [],
    }
    origins = ([body.origin] if body.origin else []) + body.origins
    unique = {
        (origin.resource_type, origin.resource_id): origin
        for origin in origins
    }
    if any(
        sum(
            (item.resource_type == "skill") == skill
            for item in unique.values()
        )
        > 3
        for skill in (True, False)
    ):
        raise HTTPException(
            status_code=422,
            detail="too_many_related_resources",
        )
    links = await asyncio.gather(
        *(
            feedback_link(FeedbackLinkRequest(origin=item))
            for item in unique.values()
        ),
    )
    for result in links:
        query = parse_qs(urlsplit(result["url"]).query)
        for param, field in (
            ("relatedSkillId", "related_skill_ids"),
            ("relatedPluginId", "related_plugin_ids"),
        ):
            payload[field] = list(
                dict.fromkeys(payload[field] + query.get(param, [])),
            )
    endpoint = (
        "/api/v1/community/questions"
        if body.article_type == "question"
        else "/api/v1/community/articles"
    )
    return await _call(
        service.community_request(
            "POST",
            endpoint,
            account_id=body.account_id,
            json=payload,
        ),
    )
