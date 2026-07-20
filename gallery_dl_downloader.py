import os
import subprocess
import sys
import tempfile
from urllib.parse import urlparse


class GalleryDlInstagramError(RuntimeError):
    pass


def _create_cookie_file():
    """Create the Netscape cookie file expected by gallery-dl."""
    session_id = (os.getenv("INSTAGRAM_SESSIONID") or "").strip()
    csrf_token = (os.getenv("INSTAGRAM_CSRFTOKEN") or "").strip()
    ds_user_id = (os.getenv("INSTAGRAM_DS_USER_ID") or "").strip()

    if not session_id:
        raise GalleryDlInstagramError(
            "INSTAGRAM_SESSIONID is required when using gallery-dl"
        )

    cookie_lines = [
        "# Netscape HTTP Cookie File",
        "# Generated temporarily by Quickgram for gallery-dl",
        f".instagram.com\tTRUE\t/\tTRUE\t2147483647\tsessionid\t{session_id}",
    ]

    if csrf_token:
        cookie_lines.append(
            f".instagram.com\tTRUE\t/\tTRUE\t2147483647\tcsrftoken\t{csrf_token}"
        )

    if ds_user_id:
        cookie_lines.append(
            f".instagram.com\tTRUE\t/\tTRUE\t2147483647\tds_user_id\t{ds_user_id}"
        )

    cookie_file = tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        suffix=".txt",
        prefix="quickgram-gallery-dl-cookies-",
        delete=False,
    )

    try:
        cookie_file.write("\n".join(cookie_lines) + "\n")
        cookie_file.flush()
        return cookie_file.name
    finally:
        cookie_file.close()


def _media_type(url):
    path = urlparse(url).path.lower()
    if path.endswith((".mp4", ".mov", ".m4v", ".webm")):
        return "video"
    return "image"


def get_instagram_media_links(shortcode):
    """
    Fetch an Instagram post using gallery-dl only.

    Return format:
    ([{"type": "image"|"video", "url": "..."}], caption)
    """
    post_url = f"https://www.instagram.com/p/{shortcode}/"
    cookie_file_path = None

    try:
        cookie_file_path = _create_cookie_file()
        print(
            "gallery-dl loaded Instagram cookies from a temporary cookie file.",
            flush=True,
        )

        command = [
            sys.executable,
            "-m",
            "gallery_dl",
            "--get-urls",
            "--cookies",
            cookie_file_path,
            post_url,
        ]

        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=90,
            check=False,
        )

        if result.stderr.strip():
            print(f"gallery-dl output: {result.stderr.strip()}", flush=True)

        if result.returncode != 0:
            raise GalleryDlInstagramError(
                f"gallery-dl exited with status {result.returncode}"
            )

        urls = []
        seen = set()
        for line in result.stdout.splitlines():
            url = line.strip()
            if not url.startswith(("https://", "http://")) or url in seen:
                continue
            seen.add(url)
            urls.append(url)

        media_links = [
            {"type": _media_type(url), "url": url}
            for url in urls
        ]

        if not media_links:
            raise GalleryDlInstagramError(
                "gallery-dl returned no downloadable media URLs"
            )

        print(
            f"gallery-dl Instagram fetch succeeded for {shortcode}: "
            f"{len(media_links)} media item(s).",
            flush=True,
        )
        return media_links, ""

    except Exception as error:
        print(
            f"gallery-dl Instagram fetch failed for shortcode {shortcode}: "
            f"{type(error).__name__}: {error}",
            flush=True,
        )
        return [], None

    finally:
        if cookie_file_path:
            try:
                os.remove(cookie_file_path)
            except OSError:
                pass
