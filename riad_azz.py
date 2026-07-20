import os

from gallery_dl_downloader import get_instagram_media_links as get_gallery_dl_media
from mobile_api_downloader import get_instagram_media_links as get_mobile_api_media


METHOD_ALIASES = {
    "mobile_api": "mobile_api",
    "mobile-api": "mobile_api",
    "gallery_dl": "gallery_dl",
    "gallery-dl": "gallery_dl",
}


def _selected_method():
    raw_method = (os.getenv("INSTAGRAM_DOWNLOADER_METHOD") or "mobile_api").strip().lower()
    method = METHOD_ALIASES.get(raw_method)

    if method is None:
        supported = ", ".join(sorted(METHOD_ALIASES))
        raise RuntimeError(
            f"Unsupported INSTAGRAM_DOWNLOADER_METHOD={raw_method!r}. "
            f"Supported values: {supported}"
        )

    return method


def get_instagram_media_links(shortcode):
    method = _selected_method()
    print(f"Quickgram downloader method: {method}", flush=True)

    if method == "gallery_dl":
        return get_gallery_dl_media(shortcode)

    return get_mobile_api_media(shortcode)
