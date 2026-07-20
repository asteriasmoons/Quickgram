import hashlib
import os

import telebot
from flask import Flask, abort, jsonify, request

# Importing this module registers all Telegram handlers.
import best_instagram_downloader  # noqa: F401
from variables import bot, bot_token


app = Flask(__name__)

ALLOWED_UPDATES = [
    "message",
    "edited_message",
    "callback_query",
    "channel_post",
    "edited_channel_post",
]
WEBHOOK_MAX_CONNECTIONS = 20


def _public_base_url():
    """Return the externally reachable Render service URL."""
    configured_url = (os.getenv("WEBHOOK_BASE_URL") or "").strip()
    render_url = (os.getenv("RENDER_EXTERNAL_URL") or "").strip()
    base_url = configured_url or render_url or "https://quickgram-xgnu.onrender.com"
    return base_url.rstrip("/")


def _webhook_secret():
    """Use a stable secret without exposing the Telegram bot token in the URL."""
    configured_secret = (os.getenv("TELEGRAM_WEBHOOK_SECRET") or "").strip()
    if configured_secret:
        return configured_secret

    return hashlib.sha256(bot_token.encode("utf-8")).hexdigest()


WEBHOOK_PATH = "/telegram/webhook"
WEBHOOK_URL = f"{_public_base_url()}{WEBHOOK_PATH}"
WEBHOOK_SECRET = _webhook_secret()
_webhook_registered = False
_webhook_changed_on_startup = False


def _normalized_updates(updates):
    """Normalize Telegram's optional allowed-updates value for comparison."""
    return sorted(updates or [])


def register_webhook():
    """Register the webhook only when Telegram's current configuration differs."""
    global _webhook_registered, _webhook_changed_on_startup

    try:
        webhook_info = bot.get_webhook_info()
        current_url = (webhook_info.url or "").rstrip("/")
        expected_url = WEBHOOK_URL.rstrip("/")
        current_updates = _normalized_updates(webhook_info.allowed_updates)
        expected_updates = _normalized_updates(ALLOWED_UPDATES)
        current_max_connections = webhook_info.max_connections

        force_refresh = (
            (os.getenv("FORCE_WEBHOOK_REFRESH") or "").strip().lower()
            in {"1", "true", "yes", "on"}
        )

        configuration_matches = (
            current_url == expected_url
            and current_updates == expected_updates
            and current_max_connections == WEBHOOK_MAX_CONNECTIONS
        )

        if configuration_matches and not force_refresh:
            _webhook_registered = True
            _webhook_changed_on_startup = False
            print(
                "Quickgram webhook already configured; no changes needed.",
                flush=True,
            )
            return

        result = bot.set_webhook(
            url=WEBHOOK_URL,
            secret_token=WEBHOOK_SECRET,
            allowed_updates=ALLOWED_UPDATES,
            drop_pending_updates=False,
            max_connections=WEBHOOK_MAX_CONNECTIONS,
        )

        if not result:
            raise RuntimeError("Telegram returned false while registering the webhook")

        _webhook_registered = True
        _webhook_changed_on_startup = True
        print(f"Quickgram Telegram webhook registered: {WEBHOOK_URL}", flush=True)
    except Exception as error:
        _webhook_registered = False
        _webhook_changed_on_startup = False
        print(
            f"Quickgram webhook registration failed: {type(error).__name__}: {error}",
            flush=True,
        )
        raise


@app.post(WEBHOOK_PATH)
def telegram_webhook():
    supplied_secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    if supplied_secret != WEBHOOK_SECRET:
        abort(403)

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        abort(400)

    try:
        update = telebot.types.Update.de_json(payload)
        bot.process_new_updates([update])
    except Exception as error:
        print(
            f"Telegram webhook processing failed: {type(error).__name__}: {error}",
            flush=True,
        )
        return jsonify({"ok": False}), 500

    return jsonify({"ok": True})


@app.get("/")
def health():
    return jsonify(
        {
            "ok": True,
            "service": "quickgram",
            "telegram_mode": "webhook",
            "webhook_registered": _webhook_registered,
            "webhook_changed_on_startup": _webhook_changed_on_startup,
            "webhook_url": WEBHOOK_URL,
        }
    )


@app.get("/health")
def health_check():
    return health()


if __name__ == "__main__":
    register_webhook()
    port = int(os.environ.get("PORT", "10000"))
    print(f"Quickgram web server listening on port {port}.", flush=True)
    app.run(host="0.0.0.0", port=port, threaded=True, use_reloader=False)
