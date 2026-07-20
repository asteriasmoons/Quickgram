import json
import os
import re
import traceback
import urllib.parse

from dotenv import load_dotenv

import instaloader
from instaloader import *
import requests
import telebot


load_dotenv(override=False)


# Environment variables
bot_token = (os.getenv("BEST_INSTAGRAM_DOWNLOADER_BOT_API") or "").strip()
if not bot_token:
    raise RuntimeError(
        "Missing BEST_INSTAGRAM_DOWNLOADER_BOT_API environment variable. "
        "Add the Telegram bot token in Render under Environment."
    )

log_channel_id_raw = (os.getenv("INSTAGRAM_DOWNLOADER_LOG_CHANNEL_ID") or "").strip()
log_channel_id = (
    int(log_channel_id_raw)
    if log_channel_id_raw.lstrip("-").isdigit()
    else None
)


# Initialize bot
bot = telebot.TeleBot(bot_token, parse_mode="HTML")


# Settings
bot_username = "@quick_instagram_bot"
caption_trail = "\n\n\n" + bot_username
session_file_name = "session"


# Optional SOCKS proxies. An empty list is valid and disables proxy rotation.
warp_proxies_raw = (os.getenv("WARP_PROXIES") or "[]").strip()
try:
    warp_proxies = json.loads(warp_proxies_raw)
except json.JSONDecodeError as error:
    raise RuntimeError("WARP_PROXIES must contain a valid JSON array.") from error

if not isinstance(warp_proxies, list):
    raise RuntimeError("WARP_PROXIES must contain a JSON array.")


# Regex
insta_post_or_reel_reg = r'(?:https?://www\.)?instagram\.com\S*?/(p|reel)/([a-zA-Z0-9_-]{11})/?'
spotify_link_reg = r'(?:https?://)?open\.spotify\.com/(track|album|playlist|artist)/[a-zA-Z0-9]+'


# Messages
start_msg = '''Send an Instagram link to download.

It can be a post link like this:
https://www.instagram.com/p/DFx_jLuACs3

Or it can be a reel link like this:
https://www.instagram.com/reel/C59DWpvOpgF'''

help_msg = '''<b>Instagram Downloader — Help</b>

Send an Instagram post or reel link and the bot will fetch the available media and send it back here.

Some posts may fail because of Instagram restrictions or rate limits. If one fails, try again later or send a different link.

For support, contact @asteriasmoons.'''

privacy_msg = '''<b>Privacy</b>

This bot does not intentionally collect, store, or share personal user data. Links are used only to process the requested download.'''

end_msg = '''If you like the bot, you can support it by starring the project on GitHub:
https://github.com/asteriasmoons/instagram-downloader

You can also check out @lystaria_bot.'''

fail_msg = '''Sorry, the download was not successful. Please try again later or use another link.'''

wrong_pattern_msg = '''Wrong pattern.
Please send an Instagram post or reel link.'''

reel_msg = '''Reel links are not supported at the moment. Please send an Instagram post link instead.'''

lystaria_msg = '''<b>Lystaria Bot</b>

You can find my productivity bot at @lystaria_bot.'''
