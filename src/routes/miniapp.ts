import { Readable } from "node:stream";
import type { Bot } from "grammy";
import type { Request, Response, Router } from "express";
import express from "express";
import { botToken, messages, publicBaseUrl } from "../config.js";
import { buildCaption } from "../bot/caption.js";
import { deliverInstagramMediaToChat } from "../bot/mediaDelivery.js";
import {
  findOwnedMedia,
  listLibraryDateAlbums,
  listLibraryDownloads,
  listLibraryDownloadsForDate,
  saveDownload
} from "../db/libraryRepository.js";
import { hasDatabaseConfig } from "../db/pool.js";
import { getInstagramMediaLinks } from "../instagram/index.js";
import { getPostOrReelShortcodeFromLink } from "../instagram/shortcode.js";
import { validateTelegramInitData } from "../telegram/auth.js";
import { resolveTelegramFileUrl } from "../telegram/files.js";

function initDataFromRequest(request: Request): string | null {
  const headerValue = request.header("x-telegram-init-data");
  if (headerValue) {
    return headerValue;
  }

  const queryValue = request.query.initData;
  if (typeof queryValue === "string" && queryValue) {
    return queryValue;
  }

  return null;
}

function authenticateMiniApp(request: Request): number {
  const initData = initDataFromRequest(request);
  if (!initData) {
    throw new Error("Missing Telegram Mini App init data.");
  }
  return validateTelegramInitData(initData).user.id;
}

function requestUrl(request: Request): string | null {
  const body = request.body as { url?: unknown } | undefined;
  return typeof body?.url === "string" ? body.url.trim() : null;
}

function queryString(request: Request, name: string, fallback: string): string {
  const value = request.query[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function queryInteger(
  request: Request,
  name: string,
  fallback: number,
  max: number
): number {
  const value = request.query[name];
  const parsed = typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function mediaUrlBuilder(request: Request): (mediaId: string) => string {
  const initData = initDataFromRequest(request) ?? "";
  return (mediaId) =>
    `${publicBaseUrl()}/api/miniapp/media/${mediaId}?initData=${encodeURIComponent(initData)}`;
}

function sendAuthError(response: Response, error: unknown): void {
  response.status(401).json({
    ok: false,
    error: error instanceof Error ? error.message : "Unauthorized."
  });
}

export function createMiniAppRouter(bot: Bot): Router {
  const router = express.Router();

  router.post("/download", async (request, response) => {
    let telegramUserId: number;
    try {
      telegramUserId = authenticateMiniApp(request);
    } catch (error) {
      sendAuthError(response, error);
      return;
    }

    const sourceUrl = requestUrl(request);
    if (!sourceUrl) {
      response.status(400).json({
        ok: false,
        error: "Paste an Instagram post or reel URL."
      });
      return;
    }

    const shortcode = getPostOrReelShortcodeFromLink(sourceUrl);
    if (!shortcode) {
      response.status(400).json({
        ok: false,
        error: "That does not look like an Instagram post or reel URL."
      });
      return;
    }

    try {
      const { mediaLinks, caption } = await getInstagramMediaLinks(shortcode);
      if (!mediaLinks.length) {
        throw new Error("Instagram returned no media.");
      }

      const finalCaption = buildCaption(caption);
      const deliveredMedia = await deliverInstagramMediaToChat(
        bot.api as never,
        telegramUserId,
        mediaLinks,
        shortcode,
        finalCaption
      );

      if (hasDatabaseConfig() && deliveredMedia.length) {
        try {
          await saveDownload({
            telegramUserId,
            chatId: telegramUserId,
            sourceUrl,
            shortcode,
            caption: finalCaption,
            media: deliveredMedia
          });
        } catch (saveError) {
          console.log(
            `Library save failed after Mini App delivery: ${
              saveError instanceof Error
                ? `${saveError.name}: ${saveError.message}`
                : String(saveError)
            }`
          );
        }
      }

      await bot.api
        .sendMessage(telegramUserId, messages.end, {
          link_preview_options: { is_disabled: true }
        })
        .catch((closingError) => {
          console.log(
            `Mini App closing message failed after successful delivery: ${
              closingError instanceof Error
                ? `${closingError.name}: ${closingError.message}`
                : String(closingError)
            }`
          );
        });

      response.json({
        ok: true,
        shortcode,
        deliveredCount: deliveredMedia.length
      });
    } catch (error) {
      console.log(
        `Mini App download failed for user ${telegramUserId}: ${
          error instanceof Error ? `${error.name}: ${error.message}` : String(error)
        }`
      );
      response.status(500).json({
        ok: false,
        error:
          "The download was not successful. Make sure you have started the bot, then try again."
      });
    }
  });

  router.get("/library", async (request, response) => {
    if (!hasDatabaseConfig()) {
      response.status(503).json({
        ok: false,
        error: "DATABASE_URL is not configured."
      });
      return;
    }

    let telegramUserId: number;
    try {
      telegramUserId = authenticateMiniApp(request);
    } catch (error) {
      sendAuthError(response, error);
      return;
    }

    const initData = initDataFromRequest(request) ?? "";
    const downloads = await listLibraryDownloads(
      telegramUserId,
      (mediaId) =>
        `/api/miniapp/media/${mediaId}?initData=${encodeURIComponent(initData)}`
    );

    response.json({ ok: true, downloads });
  });

  router.get("/library/albums", async (request, response) => {
    if (!hasDatabaseConfig()) {
      response.status(503).json({
        ok: false,
        error: "DATABASE_URL is not configured."
      });
      return;
    }

    let telegramUserId: number;
    try {
      telegramUserId = authenticateMiniApp(request);
    } catch (error) {
      sendAuthError(response, error);
      return;
    }

    const timezone = queryString(request, "timezone", "UTC");
    const limit = queryInteger(request, "limit", 30, 60);
    const offset = queryInteger(request, "offset", 0, 5_000);
    const albums = await listLibraryDateAlbums(
      telegramUserId,
      timezone,
      limit,
      offset,
      mediaUrlBuilder(request)
    );

    response.json({
      ok: true,
      albums,
      hasMore: albums.length === limit
    });
  });

  router.get("/library/albums/:dateKey", async (request, response) => {
    if (!hasDatabaseConfig()) {
      response.status(503).json({
        ok: false,
        error: "DATABASE_URL is not configured."
      });
      return;
    }

    let telegramUserId: number;
    try {
      telegramUserId = authenticateMiniApp(request);
    } catch (error) {
      sendAuthError(response, error);
      return;
    }

    const dateKey = request.params.dateKey;
    if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      response.status(400).json({
        ok: false,
        error: "Invalid library date."
      });
      return;
    }

    const timezone = queryString(request, "timezone", "UTC");
    const limit = queryInteger(request, "limit", 20, 50);
    const offset = queryInteger(request, "offset", 0, 5_000);
    const downloads = await listLibraryDownloadsForDate(
      telegramUserId,
      timezone,
      dateKey,
      limit,
      offset,
      mediaUrlBuilder(request)
    );

    response.json({
      ok: true,
      downloads,
      hasMore: downloads.length === limit
    });
  });

  router.get("/media/:mediaId", async (request, response) => {
    if (!hasDatabaseConfig()) {
      response.sendStatus(503);
      return;
    }

    let telegramUserId: number;
    try {
      telegramUserId = authenticateMiniApp(request);
    } catch (error) {
      sendAuthError(response, error);
      return;
    }

    const mediaId = request.params.mediaId;
    if (!mediaId) {
      response.sendStatus(404);
      return;
    }

    const media = await findOwnedMedia(mediaId, telegramUserId);
    if (!media) {
      response.sendStatus(404);
      return;
    }

    const telegramFileUrl = await resolveTelegramFileUrl(
      bot,
      media.telegramFileId,
      botToken()
    );
    const fileResponse = await fetch(telegramFileUrl);
    if (!fileResponse.ok || !fileResponse.body) {
      response.sendStatus(502);
      return;
    }

    const contentType =
      fileResponse.headers.get("content-type") ??
      (media.mediaType === "video" ? "video/mp4" : "image/jpeg");
    response.setHeader("content-type", contentType);
    response.setHeader("cache-control", "private, max-age=300");
    Readable.fromWeb(fileResponse.body as never).pipe(response);
  });

  return router;
}
