import { Readable } from "node:stream";
import type { Bot } from "grammy";
import type { Request, Response, Router } from "express";
import express from "express";
import { botToken } from "../config.js";
import { findOwnedMedia, listLibraryDownloads } from "../db/libraryRepository.js";
import { hasDatabaseConfig } from "../db/pool.js";
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

function sendAuthError(response: Response, error: unknown): void {
  response.status(401).json({
    ok: false,
    error: error instanceof Error ? error.message : "Unauthorized."
  });
}

export function createMiniAppRouter(bot: Bot): Router {
  const router = express.Router();

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
