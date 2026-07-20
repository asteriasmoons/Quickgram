import os

import requests


_API_BASE_URL = "https://i.instagram.com/api/v1"
_ENCODING_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"


class InstagramFetchError(RuntimeError):
    pass


def _shortcode_to_media_id(shortcode):
    media_id = 0
    for character in shortcode:
        try:
            value = _ENCODING_CHARS.index(character)
        except ValueError as error:
            raise InstagramFetchError(
                f"Invalid Instagram shortcode character: {character!r}"
            ) from error
        media_id = (media_id * 64) + value
    return str(media_id)


def _build_session():
    session_id = (os.getenv("INSTAGRAM_SESSIONID") or "").strip()
    csrf_token = (os.getenv("INSTAGRAM_CSRFTOKEN") or "").strip()

    if not session_id:
        raise InstagramFetchError(
            "INSTAGRAM_SESSIONID is missing from the environment"
        )

    session = requests.Session()
    for domain in (
        ".instagram.com",
        "instagram.com",
        ".i.instagram.com",
        "i.instagram.com",
    ):
        session.cookies.set("sessionid", session_id, domain=domain, path="/")
        if csrf_token:
            session.cookies.set("csrftoken", csrf_token, domain=domain, path="/")

    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 "
                "Instagram 335.0.0.39.93"
            ),
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "X-IG-App-ID": "936619743392459",
            "X-ASBD-ID": "359341",
            "X-IG-WWW-Claim": "0",
            "Origin": "https://www.instagram.com",
            "Referer": "https://www.instagram.com/",
        }
    )

    if csrf_token:
        session.headers["X-CSRFToken"] = csrf_token

    return session


def _best_image_url(media):
    candidates = (
        media.get("image_versions2", {}).get("candidates", [])
        or media.get("image_versions", {}).get("candidates", [])
    )
    valid_candidates = [candidate for candidate in candidates if candidate.get("url")]
    if not valid_candidates:
        return None
    best = max(
        valid_candidates,
        key=lambda candidate: (
            int(candidate.get("width") or 0) * int(candidate.get("height") or 0),
            int(candidate.get("width") or 0),
        ),
    )
    return best.get("url")


def _best_video_url(media):
    versions = [
        version
        for version in media.get("video_versions", [])
        if version.get("url")
    ]
    if not versions:
        return None
    best = max(
        versions,
        key=lambda version: (
            int(version.get("width") or 0) * int(version.get("height") or 0),
            int(version.get("width") or 0),
        ),
    )
    return best.get("url")


def _media_item(media):
    video_url = _best_video_url(media)
    if video_url:
        return {"type": "video", "url": video_url}
    image_url = _best_image_url(media)
    if image_url:
        return {"type": "image", "url": image_url}
    return None


def _extract_media_items(product):
    carousel = product.get("carousel_media") or []
    source_items = carousel if carousel else [product]
    media_links = []
    for source_item in source_items:
        item = _media_item(source_item)
        if item:
            media_links.append(item)
    return media_links


def _extract_caption(product):
    caption = product.get("caption")
    if isinstance(caption, dict):
        return caption.get("text") or ""
    if isinstance(caption, str):
        return caption
    return ""


def get_instagram_media_links(shortcode):
    try:
        media_id = _shortcode_to_media_id(shortcode)
        session = _build_session()
        response = session.get(
            f"{_API_BASE_URL}/media/{media_id}/info/",
            timeout=30,
            allow_redirects=False,
        )

        if response.status_code in (301, 302, 303, 307, 308):
            raise InstagramFetchError(
                "Instagram redirected the media request; the session may be invalid"
            )
        if response.status_code == 401:
            raise InstagramFetchError(
                "Instagram rejected the session cookie with HTTP 401"
            )
        if response.status_code == 403:
            raise InstagramFetchError(
                "Instagram blocked the mobile media request with HTTP 403"
            )

        response.raise_for_status()
        payload = response.json()
        items = payload.get("items") or []

        if not items:
            message = payload.get("message") or payload.get("status") or "empty response"
            raise InstagramFetchError(
                f"Instagram returned no media item: {message}"
            )

        product = items[0]
        media_links = _extract_media_items(product)
        caption = _extract_caption(product)

        if not media_links:
            raise InstagramFetchError(
                "Instagram returned the post but no downloadable media URLs"
            )

        print(
            f"Instagram mobile API fetch succeeded for {shortcode}: "
            f"{len(media_links)} media item(s).",
            flush=True,
        )
        return media_links, caption

    except Exception as error:
        print(
            f"Instagram fetch failed for shortcode {shortcode}: "
            f"{type(error).__name__}: {error}",
            flush=True,
        )
        return [], None
