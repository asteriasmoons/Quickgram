import io
import time

import requests
import telebot
from telebot import apihelper

from functions import *
from riad_azz import get_instagram_media_links


MEDIA_DOWNLOAD_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
        "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 "
        "Mobile/15E148 Safari/604.1"
    ),
    "Referer": "https://www.instagram.com/",
}

# The pyTelegramBotAPI defaults are too short for uploading several full-size
# Instagram files from a hosted service.
apihelper.CONNECT_TIMEOUT = 120
apihelper.READ_TIMEOUT = 300

TELEGRAM_UPLOAD_TIMEOUT = 300
TELEGRAM_UPLOAD_RETRIES = 3
CAROUSEL_CHUNK_SIZE = 2


def download_media_file(url, filename):
    response = requests.get(
        url,
        headers=MEDIA_DOWNLOAD_HEADERS,
        timeout=60,
        allow_redirects=True,
    )
    response.raise_for_status()

    file_data = io.BytesIO(response.content)
    file_data.name = filename
    file_data.seek(0)
    return file_data


def rewind_media(media_items):
    for media in media_items:
        media.media.seek(0)


def send_media_group_with_retry(chat_id, media_items, chunk_number):
    last_error = None

    for attempt in range(1, TELEGRAM_UPLOAD_RETRIES + 1):
        try:
            rewind_media(media_items)
            print(
                f"Uploading Telegram carousel chunk {chunk_number}, "
                f"attempt {attempt}/{TELEGRAM_UPLOAD_RETRIES}...",
                flush=True,
            )
            bot.send_media_group(
                chat_id,
                media_items,
                timeout=TELEGRAM_UPLOAD_TIMEOUT,
            )
            return
        except Exception as error:
            last_error = error
            print(
                f"Telegram carousel chunk {chunk_number} upload attempt {attempt} failed: "
                f"{type(error).__name__}: {error}",
                flush=True,
            )

            if attempt < TELEGRAM_UPLOAD_RETRIES:
                time.sleep(3 * attempt)

    raise last_error


@bot.message_handler(commands=['start'])
def start_command_handler(message):
    bot.send_message(message.chat.id, start_msg, disable_web_page_preview=True)
    log(f"{bot_username} log:\n\nuser: {message.chat.id}\n\nstart command")


@bot.message_handler(commands=['help'])
def help_command_handler(message):
    bot.send_message(message.chat.id, help_msg, disable_web_page_preview=True)
    log(f"{bot_username} log:\n\nuser: {message.chat.id}\n\nhelp command")


@bot.message_handler(commands=['privacy'])
def privacy_message_handler(message):
    bot.send_message(message.chat.id, privacy_msg, disable_web_page_preview=True)
    log(f"{bot_username} log:\n\nuser: {message.chat.id}\n\nprivacy command")


@bot.message_handler(regexp=spotify_link_reg)
def spotify_link_handler(message):
    bot.send_message(
        message.chat.id,
        "This bot only supports Instagram links. Please send an Instagram post or reel link.\n\n"
        "If you want to download from Spotify you can check out my other bot: @SpotSeekBot"
    )


@bot.message_handler(regexp=insta_post_or_reel_reg)
def post_or_reel_link_handler(message):
    guide_msg_1 = None
    opened_files = []
    media_delivered = False

    try:
        log(f"{bot_username} log:\n\nuser:\n{message.chat.id}\n\n✅ message text:\n{message.text}")
        guide_msg_1 = bot.send_message(message.chat.id, "Ok wait a few moments...")

        post_shortcode = get_post_or_reel_shortcode_from_link(message.text)
        print(post_shortcode, flush=True)

        if not post_shortcode:
            raise RuntimeError("Could not extract the Instagram shortcode")

        media_links, caption = get_instagram_media_links(post_shortcode)

        if not media_links:
            raise RuntimeError("Instagram returned no media")

        caption = caption or ""
        while len(caption) + len(caption_trail) > 1024:
            caption = caption[:-1]
        caption += caption_trail

        media_list = []

        for index, item in enumerate(media_links):
            is_video = item.get("type") == "video"
            extension = "mp4" if is_video else "jpg"
            filename = f"{post_shortcode}_{index + 1}.{extension}"

            print(
                f"Downloading Instagram media {index + 1}/{len(media_links)} to Render...",
                flush=True,
            )

            media_file = download_media_file(item["url"], filename)
            opened_files.append(media_file)

            item_caption = caption if index == 0 else None

            if is_video:
                media = telebot.types.InputMediaVideo(media_file, caption=item_caption)
            else:
                media = telebot.types.InputMediaPhoto(media_file, caption=item_caption)

            media_list.append(media)

        if len(media_list) == 1:
            media = media_list[0]
            media.media.seek(0)

            if isinstance(media, telebot.types.InputMediaPhoto):
                bot.send_photo(
                    message.chat.id,
                    media.media,
                    caption=media.caption,
                    timeout=TELEGRAM_UPLOAD_TIMEOUT,
                )
            else:
                bot.send_video(
                    message.chat.id,
                    media.media,
                    caption=media.caption,
                    supports_streaming=True,
                    timeout=TELEGRAM_UPLOAD_TIMEOUT,
                )
        else:
            chunk_number = 0
            for start in range(0, len(media_list), CAROUSEL_CHUNK_SIZE):
                chunk_number += 1
                chunk = media_list[start:start + CAROUSEL_CHUNK_SIZE]
                send_media_group_with_retry(message.chat.id, chunk, chunk_number)

        media_delivered = True

        print(
            f"Telegram delivery succeeded for {post_shortcode}: {len(media_list)} media item(s).",
            flush=True,
        )

        if guide_msg_1:
            try_to_delete_message(message.chat.id, guide_msg_1.message_id)
            guide_msg_1 = None

        try:
            bot.send_message(
                message.chat.id,
                end_msg,
                disable_web_page_preview=True,
            )
        except Exception as closing_error:
            print(
                f"Closing message failed after successful delivery: "
                f"{type(closing_error).__name__}: {closing_error}",
                flush=True,
            )

    except Exception as error:
        print(
            f"Quickgram delivery failed for chat {message.chat.id}: "
            f"{type(error).__name__}: {error}",
            flush=True,
        )

        try:
            if guide_msg_1:
                try_to_delete_message(message.chat.id, guide_msg_1.message_id)
        except Exception:
            pass

        try:
            log(
                f"{bot_username} log:\n\nuser: {message.chat.id}\n\n"
                f"🛑 error in main body: {type(error).__name__}: {error}"
            )
        except Exception:
            pass

        if not media_delivered:
            bot.send_message(
                message.chat.id,
                fail_msg,
                disable_web_page_preview=True,
            )

    finally:
        for media_file in opened_files:
            try:
                media_file.close()
            except Exception:
                pass


@bot.message_handler(func=lambda message: True)
def wrong_pattern_handler(message):
    log(f"{bot_username} log:\n\nuser: {message.chat.id}\n\n❌wrong pattern: {message.text}")
    bot.send_message(message.chat.id, wrong_pattern_msg, disable_web_page_preview=True)


if __name__ == "__main__":
    print("Quickgram Telegram bot polling started.", flush=True)
    bot.infinity_polling(
        skip_pending=True,
        timeout=30,
        long_polling_timeout=30,
        allowed_updates=[
            "message",
            "edited_message",
            "callback_query",
            "channel_post",
            "edited_channel_post",
        ],
    )
