import { InputFile, type Context } from "grammy";
import type { Message } from "grammy/types";
import {
  MEDIA_DOWNLOAD_HEADERS,
  TELEGRAM_URL_SEND_TIMEOUT_MS,
  TELEGRAM_UPLOAD_TIMEOUT_MS,
  TELEGRAM_UPLOAD_RETRIES
} from "../config.js";
import type { InstagramMediaLink } from "../instagram/types.js";
import type { SaveMediaInput } from "../db/libraryRepository.js";

interface DownloadedMedia {
  type: "photo" | "video";
  inputFile: InputFile;
  filename: string;
  size: number;
}

export interface DeliveredMediaItem extends SaveMediaInput {}

interface TelegramSendApi {
  sendPhoto(
    chatId: number,
    photo: InputFile | string,
    options?: unknown,
    signal?: AbortSignal
  ): Promise<Message>;
  sendVideo(
    chatId: number,
    video: InputFile | string,
    options?: unknown,
    signal?: AbortSignal
  ): Promise<Message>;
}

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
    filename,
    size: buffer.byteLength
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

async function sendSingleMediaWithRetry(
  api: TelegramSendApi,
  chatId: number,
  mediaLink: InstagramMediaLink,
  shortcode: string,
  caption: string | undefined,
  orderIndex: number
): Promise<Message> {
  let lastError: unknown = null;
  let downloadedMedia: DownloadedMedia | null = null;
  const mediaType = mediaLink.type === "video" ? "video" : "photo";
  const extension = mediaType === "video" ? "mp4" : "jpg";
  const filename = `${shortcode}_${orderIndex + 1}.${extension}`;

  for (let attempt = 1; attempt <= TELEGRAM_UPLOAD_RETRIES; attempt += 1) {
    const uploadMode = attempt === 1 ? "url" : "server-upload";

    try {
      if (attempt > 1 && !downloadedMedia) {
        console.log(
          `Telegram URL send failed; downloading ${filename} to Render for fallback upload...`
        );
        downloadedMedia = await downloadMediaFile(mediaLink, shortcode, orderIndex);
      }

      const uploadSource =
        attempt === 1 ? mediaLink.url : downloadedMedia?.inputFile;
      if (!uploadSource) {
        throw new Error("Fallback upload source is missing.");
      }

      console.log(
        `Sending Telegram media ${orderIndex + 1} (${filename}${
          downloadedMedia ? `, ${downloadedMedia.size} bytes` : ""
        }) via ${uploadMode}, attempt ${attempt}/${TELEGRAM_UPLOAD_RETRIES}...`
      );

      const signal = AbortSignal.timeout(
        attempt === 1 ? TELEGRAM_URL_SEND_TIMEOUT_MS : TELEGRAM_UPLOAD_TIMEOUT_MS
      );
      const message =
        mediaType === "photo"
          ? await api.sendPhoto(
              chatId,
              uploadSource,
              {
                ...(caption ? { caption } : {})
              },
              signal
            )
          : await api.sendVideo(
              chatId,
              uploadSource,
              {
                ...(caption ? { caption } : {}),
                supports_streaming: true
              },
              signal
            );

      console.log(
        `Telegram media ${orderIndex + 1} sent successfully via ${uploadMode}.`
      );
      return message;
    } catch (error) {
      lastError = error;
      console.log(
        `Telegram media ${orderIndex + 1} ${uploadMode} attempt ${attempt} failed: ${
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

export async function deliverInstagramMediaToChat(
  api: TelegramSendApi,
  chatId: number,
  mediaLinks: InstagramMediaLink[],
  shortcode: string,
  caption: string
): Promise<DeliveredMediaItem[]> {
  const delivered: DeliveredMediaItem[] = [];

  for (const [index, media] of mediaLinks.entries()) {
    const message = await sendSingleMediaWithRetry(
      api,
      chatId,
      media,
      shortcode,
      index === 0 ? caption : undefined,
      index
    );

    const deliveredItem = deliveredMediaFromMessage(
      message,
      media.type === "video" ? "video" : "photo",
      index
    );
    if (deliveredItem) {
      delivered.push(deliveredItem);
    }
  }

  return delivered;
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

  return deliverInstagramMediaToChat(
    ctx.api as unknown as TelegramSendApi,
    ctx.chat.id,
    mediaLinks,
    shortcode,
    caption
  );
}
