import crypto from "node:crypto";
import dotenv from "dotenv";

dotenv.config({ override: false });

export const BOT_USERNAME = "@quick_instagram_bot";

export const INSTA_POST_OR_REEL_REGEX =
  /(?:https?:\/\/www\.)?instagram\.com\S*?\/(p|reel)\/([a-zA-Z0-9_-]{11})\/?/i;

export const SPOTIFY_LINK_REGEX =
  /(?:https?:\/\/)?open\.spotify\.com\/(track|album|playlist|artist)\/[a-zA-Z0-9]+/i;

export const ALLOWED_UPDATES = [
  "message",
  "edited_message",
  "callback_query",
  "channel_post",
  "edited_channel_post"
] as const;

export const WEBHOOK_PATH = "/telegram/webhook";
export const WEBHOOK_MAX_CONNECTIONS = 20;
export const TELEGRAM_URL_SEND_TIMEOUT_MS = 25_000;
export const TELEGRAM_UPLOAD_TIMEOUT_MS = 90_000;
export const TELEGRAM_UPLOAD_RETRIES = 3;
export const CAROUSEL_CHUNK_SIZE = 2;

export const MEDIA_DOWNLOAD_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 " +
    "Mobile/15E148 Safari/604.1",
  Referer: "https://www.instagram.com/"
};

export function requiredEnv(name: string): string {
  const value = (process.env[name] ?? "").trim();
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
}

export function optionalIntegerEnv(name: string): number | null {
  const raw = (process.env[name] ?? "").trim();
  if (!raw || !/^-?\d+$/.test(raw)) {
    return null;
  }
  return Number(raw);
}

export function botToken(): string {
  return requiredEnv("BEST_INSTAGRAM_DOWNLOADER_BOT_API");
}

export function logChannelId(): number | null {
  return optionalIntegerEnv("INSTAGRAM_DOWNLOADER_LOG_CHANNEL_ID");
}

export function publicBaseUrl(): string {
  const configuredUrl = (process.env.WEBHOOK_BASE_URL ?? "").trim();
  const renderUrl = (process.env.RENDER_EXTERNAL_URL ?? "").trim();
  const baseUrl = configuredUrl || renderUrl;
  if (!baseUrl) {
    throw new Error(
      "WEBHOOK_BASE_URL or RENDER_EXTERNAL_URL must be configured with the active Render service URL."
    );
  }
  return baseUrl.replace(/\/+$/, "");
}

export function miniAppUrl(): string {
  const configuredUrl = (process.env.MINIAPP_PUBLIC_URL ?? "").trim();
  return configuredUrl || `${publicBaseUrl()}/miniapp`;
}

export function webhookUrl(): string {
  return `${publicBaseUrl()}${WEBHOOK_PATH}`;
}

export function webhookSecret(): string {
  const configuredSecret = (process.env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();
  if (configuredSecret) {
    return configuredSecret;
  }
  return crypto.createHash("sha256").update(botToken()).digest("hex");
}

export function shouldForceWebhookRefresh(): boolean {
  return ["1", "true", "yes", "on"].includes(
    (process.env.FORCE_WEBHOOK_REFRESH ?? "").trim().toLowerCase()
  );
}

export function databaseUrl(): string | null {
  const value = (process.env.DATABASE_URL ?? "").trim();
  return value || null;
}

export const messages = {
  start: `Send an Instagram link to download.

It can be a post link like this:
https://www.instagram.com/p/DFx_jLuACs3

Or it can be a reel link like this:
https://www.instagram.com/reel/C59DWpvOpgF`,
  help: `<b>Instagram Downloader - Help</b>

Send an Instagram post or reel link and the bot will fetch the available media and send it back here.

Some posts may fail because of Instagram restrictions or rate limits. If one fails, try again later or send a different link.

For support, contact @asteriasmoons.`,
  privacy: `<b>Privacy</b>

This bot stores Telegram media file IDs for downloads you successfully receive so your Mini App Library can show them later. Your Instagram links are used to process requested downloads.`,
  end: `If you like the bot, you can support it by starring the project on GitHub:
https://github.com/asteriasmoons/Quickgram

You can also check out @voxappsupdates to check out iOS apps for reading, reminders and habits, health, wellness, journaling and spirituality or visit the website at https://docs.voxiverse.ink.`,
  fail: "Sorry, the download was not successful. Please try again later or use another link.",
  wrongPattern: "Wrong pattern.\nPlease send an Instagram post or reel link.",
  spotify:
    "This bot only supports Instagram links. Please send an Instagram post or reel link.\n\n" +
    "If you want to download from Spotify you can check out my other bot: @SpotSeekBot"
} as const;
