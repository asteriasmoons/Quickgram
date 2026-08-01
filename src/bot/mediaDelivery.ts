import { InputFile, type Context } from "grammy";
import type { Message } from "grammy/types";
import {
  CAROUSEL_CHUNK_SIZE,
  MEDIA_DOWNLOAD_HEADERS,
  TELEGRAM_UPLOAD_RETRIES,
  TELEGRAM_UPLOAD_TIMEOUT_MS
} from "../config.js";
import type { InstagramMediaLink } from "../instagram/types.js";
import type { SaveMediaInput } from "../db/libraryRepository.js";

interface DownloadedMedia {
  type: "photo" | "video";
  inputFile: InputFile;
  filename: string;
}

export interface DeliveredMediaItem extends SaveMediaInput {}

async function downloadMediaFile(
  item: InstagramMediaLink,
  shortcode: string,
  index: number
): Promise<DownloadedMedia> {
  const isVideo = item.type === "video";
  const extension = isVideo ? "mp4" : "jpg";
  const filename = `${shortcode}_${index + 1}.${extension}`;

  const response = await fetch(item.url, {
    headers: MEDIA_DOWNLOAD_HEADERS,
    redirect: "follow",
    signal: AbortSignal.timeout(60_000)
  });

  if (!response.ok) {
    throw new Error(`Failed to download Instagram media: HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    type: isVideo ? "video" : "photo",
    inputFile: new InputFile(buffer, filename),
    filename
  };
}

function largestPhoto(message: Message): Message.PhotoMessage["photo"][number] | null {
  if (!("photo" in message) || !message.photo?.length) {
    return null;
  }
  return [...message.photo].sort((left, right) => {
    const leftArea = (left.width ?? 0) * (left.height ?? 0);
    const rightArea = (right.width ?? 0) * (right.height ?? 0);
    return rightArea - leftArea;
  })[0] ?? null;
}

function deliveredMediaFromMessage(
  message: Message,
  fallbackType: "photo" | "video",
  orderIndex: number
): DeliveredMediaItem | null {
  const photo = largestPhoto(message);
  if (photo) {
    return {
      type: "photo",
      telegramFileId: photo.file_id,
      telegramFileUniqueId: photo.file_unique_id,
      width: photo.width,
      height: photo.height,
      ...(photo.file_size !== undefined ? { fileSize: photo.file_size } : {}),
      orderIndex
    };
  }

  if ("video" in message && message.video) {
    return {
      type: "video",
      telegramFileId: message.video.file_id,
      telegramFileUniqueId: message.video.file_unique_id,
      width: message.video.width,
      height: message.video.height,
      duration: message.video.duration,
      ...(message.video.file_size !== undefined
        ? { fileSize: message.video.file_size }
        : {}),
      orderIndex
    };
  }

  console.log(
    `Telegram delivered message without ${fallbackType} metadata at order ${orderIndex}.`
  );
  return null;
}

async function sendMediaGroupWithRetry(
  ctx: Context,
  chatId: number,
  mediaItems: DownloadedMedia[],
  caption: string | undefined,
  chunkNumber: number
): Promise<Message[]> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= TELEGRAM_UPLOAD_RETRIES; attempt += 1) {
    try {
      console.log(
        `Uploading Telegram carousel chunk ${chunkNumber}, attempt ${attempt}/${TELEGRAM_UPLOAD_RETRIES}...`
      );
      return await ctx.api.sendMediaGroup(
        chatId,
        mediaItems.map((item, index) => ({
          type: item.type,
          media: item.inputFile,
          ...(index === 0 && caption ? { caption } : {}),
          ...(item.type === "video" ? { supports_streaming: true } : {})
        })) as never
      );
    } catch (error) {
      lastError = error;
      console.log(
        `Telegram carousel chunk ${chunkNumber} upload attempt ${attempt} failed: ${
          error instanceof Error ? `${error.name}: ${error.message}` : String(error)
        }`
      );

      if (attempt < TELEGRAM_UPLOAD_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 3_000 * attempt));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function deliverInstagramMedia(
  ctx: Context,
  mediaLinks: InstagramMediaLink[],
  shortcode: string,
  caption: string
): Promise<DeliveredMediaItem[]> {
  if (!ctx.chat) {
    throw new Error("Cannot deliver media without a chat.");
  }

  const downloadedMedia: DownloadedMedia[] = [];

  for (const [index, item] of mediaLinks.entries()) {
    console.log(
      `Downloading Instagram media ${index + 1}/${mediaLinks.length} to the server...`
    );
    downloadedMedia.push(await downloadMediaFile(item, shortcode, index));
  }

  const delivered: DeliveredMediaItem[] = [];

  if (downloadedMedia.length === 1) {
    const media = downloadedMedia[0];
    if (!media) {
      return delivered;
    }

    const message =
      media.type === "photo"
        ? await ctx.replyWithPhoto(media.inputFile, {
            caption
          })
        : await ctx.replyWithVideo(media.inputFile, {
            caption,
            supports_streaming: true
          });

    const item = deliveredMediaFromMessage(message, media.type, 0);
    if (item) {
      delivered.push(item);
    }
  } else {
    let chunkNumber = 0;
    for (let start = 0; start < downloadedMedia.length; start += CAROUSEL_CHUNK_SIZE) {
      chunkNumber += 1;
      const chunk = downloadedMedia.slice(start, start + CAROUSEL_CHUNK_SIZE);
      const messages = await sendMediaGroupWithRetry(
        ctx,
        ctx.chat.id,
        chunk,
        start === 0 ? caption : undefined,
        chunkNumber
      );

      for (const [index, message] of messages.entries()) {
        const original = chunk[index];
        if (!original) {
          continue;
        }
        const deliveredItem = deliveredMediaFromMessage(
          message,
          original.type,
          start + index
        );
        if (deliveredItem) {
          delivered.push(deliveredItem);
        }
      }
    }
  }

  return delivered;
}
