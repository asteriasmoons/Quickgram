import { Bot, InlineKeyboard, webhookCallback, type Context } from "grammy";
import {
  INSTA_POST_OR_REEL_REGEX,
  SPOTIFY_LINK_REGEX,
  botToken,
  messages,
  miniAppUrl
} from "../config.js";
import { hasDatabaseConfig } from "../db/pool.js";
import { saveDownload } from "../db/libraryRepository.js";
import { getInstagramMediaLinks } from "../instagram/index.js";
import { getPostOrReelShortcodeFromLink } from "../instagram/shortcode.js";
import { botLogPrefix, log } from "./logging.js";
import { deliverInstagramMedia } from "./mediaDelivery.js";
import { buildCaption } from "./caption.js";

const noPreview = { link_preview_options: { is_disabled: true } } as const;

function startKeyboard(): InlineKeyboard {
  return new InlineKeyboard().webApp("Open Quickgram", miniAppUrl());
}

async function tryToDeleteMessage(
  ctx: Context,
  chatId: number,
  messageId: number
): Promise<void> {
  try {
    await ctx.api.deleteMessage(chatId, messageId);
  } catch {
    // Ignore deletion failures; the user may have already removed it.
  }
}

async function saveDeliveredMedia(
  ctx: Context,
  sourceUrl: string,
  shortcode: string,
  caption: string,
  media: Awaited<ReturnType<typeof deliverInstagramMedia>>
): Promise<void> {
  if (!ctx.chat || !ctx.from || !media.length) {
    return;
  }

  if (!hasDatabaseConfig()) {
    console.log("DATABASE_URL is not configured; skipping Library persistence.");
    return;
  }

  try {
    await saveDownload({
      telegramUserId: ctx.from.id,
      chatId: ctx.chat.id,
      sourceUrl,
      shortcode,
      caption,
      media
    });
  } catch (error) {
    console.log(
      `Library save failed after successful delivery: ${
        error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      }`
    );
  }
}

async function handleInstagramLink(ctx: Context): Promise<void> {
  const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";
  const chatId = ctx.chat?.id;
  if (!text || !chatId) {
    return;
  }

  let guideMessageId: number | null = null;
  let mediaDelivered = false;

  try {
    await log(
      ctx.api,
      `${botLogPrefix()}\n\nuser:\n${chatId}\n\n✅ message text:\n${text}`
    );

    const guideMessage = await ctx.reply("Ok wait a few moments...");
    guideMessageId = guideMessage.message_id;

    const shortcode = getPostOrReelShortcodeFromLink(text);
    console.log(shortcode);

    if (!shortcode) {
      throw new Error("Could not extract the Instagram shortcode.");
    }

    const { mediaLinks, caption } = await getInstagramMediaLinks(shortcode);
    if (!mediaLinks.length) {
      throw new Error("Instagram returned no media.");
    }

    const finalCaption = buildCaption(caption);
    const deliveredMedia = await deliverInstagramMedia(
      ctx,
      mediaLinks,
      shortcode,
      finalCaption
    );
    mediaDelivered = true;

    console.log(
      `Telegram delivery succeeded for ${shortcode}: ${deliveredMedia.length} media item(s).`
    );

    if (guideMessageId) {
      await tryToDeleteMessage(ctx, chatId, guideMessageId);
      guideMessageId = null;
    }

    await saveDeliveredMedia(ctx, text, shortcode, finalCaption, deliveredMedia);

    try {
      await ctx.reply(messages.end, noPreview);
    } catch (error) {
      console.log(
        `Closing message failed after successful delivery: ${
          error instanceof Error ? `${error.name}: ${error.message}` : String(error)
        }`
      );
    }
  } catch (error) {
    console.log(
      `Quickgram delivery failed for chat ${chatId}: ${
        error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      }`
    );

    if (guideMessageId) {
      await tryToDeleteMessage(ctx, chatId, guideMessageId);
    }

    await log(
      ctx.api,
      `${botLogPrefix()}\n\nuser: ${chatId}\n\n🛑 error in main body: ${
        error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      }`
    );

    if (!mediaDelivered) {
      await ctx.reply(messages.fail, noPreview);
    }
  }
}

export function createBot(): Bot {
  const bot = new Bot(botToken());

  bot.command("start", async (ctx) => {
    await ctx.reply(messages.start, {
      ...noPreview,
      reply_markup: startKeyboard()
    });
    await log(ctx.api, `${botLogPrefix()}\n\nuser: ${ctx.chat?.id}\n\nstart command`);
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(messages.help, { parse_mode: "HTML", ...noPreview });
    await log(ctx.api, `${botLogPrefix()}\n\nuser: ${ctx.chat?.id}\n\nhelp command`);
  });

  bot.command("privacy", async (ctx) => {
    await ctx.reply(messages.privacy, { parse_mode: "HTML", ...noPreview });
    await log(ctx.api, `${botLogPrefix()}\n\nuser: ${ctx.chat?.id}\n\nprivacy command`);
  });

  bot.hears(SPOTIFY_LINK_REGEX, async (ctx) => {
    await ctx.reply(messages.spotify);
  });

  bot.hears(INSTA_POST_OR_REEL_REGEX, handleInstagramLink);

  bot.on("message:text", async (ctx) => {
    await log(
      ctx.api,
      `${botLogPrefix()}\n\nuser: ${ctx.chat.id}\n\n❌wrong pattern: ${ctx.message.text}`
    );
    await ctx.reply(messages.wrongPattern, noPreview);
  });

  bot.catch((error) => {
    console.error("Quickgram bot handler failed:", error.error);
  });

  return bot;
}

export function expressWebhookCallback(bot: Bot) {
  return webhookCallback(bot, "express");
}
