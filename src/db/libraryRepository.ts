import crypto from "node:crypto";
import type pg from "pg";
import { getPool } from "./pool.js";

export type LibraryMediaType = "photo" | "video";

export interface SaveDownloadInput {
  telegramUserId: number;
  chatId: number;
  sourceUrl: string;
  shortcode: string;
  caption: string;
  media: SaveMediaInput[];
}

export interface SaveMediaInput {
  type: LibraryMediaType;
  telegramFileId: string;
  telegramFileUniqueId?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  duration?: number;
  orderIndex: number;
}

export interface LibraryMediaItem {
  id: string;
  mediaType: LibraryMediaType;
  url: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  orderIndex: number;
  createdAt: string;
}

export interface LibraryDownload {
  id: string;
  shortcode: string;
  sourceUrl: string | null;
  caption: string | null;
  createdAt: string;
  media: LibraryMediaItem[];
}

function rowNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export async function saveDownload(input: SaveDownloadInput): Promise<string> {
  const pool = getPool();
  const downloadId = crypto.randomUUID();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO quickgram_downloads
        (id, telegram_user_id, chat_id, source_url, shortcode, caption)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        downloadId,
        input.telegramUserId,
        input.chatId,
        input.sourceUrl,
        input.shortcode,
        input.caption
      ]
    );

    for (const item of input.media) {
      await client.query(
        `INSERT INTO quickgram_media
          (id, download_id, telegram_user_id, media_type, telegram_file_id,
           telegram_file_unique_id, file_size, width, height, duration, order_index)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          crypto.randomUUID(),
          downloadId,
          input.telegramUserId,
          item.type,
          item.telegramFileId,
          item.telegramFileUniqueId ?? null,
          item.fileSize ?? null,
          item.width ?? null,
          item.height ?? null,
          item.duration ?? null,
          item.orderIndex
        ]
      );
    }

    await client.query("COMMIT");
    return downloadId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listLibraryDownloads(
  telegramUserId: number,
  mediaUrlForId: (mediaId: string) => string
): Promise<LibraryDownload[]> {
  const result = await getPool().query(
    `SELECT
       d.id AS download_id,
       d.shortcode,
       d.source_url,
       d.caption,
       d.created_at AS download_created_at,
       m.id AS media_id,
       m.media_type,
       m.width,
       m.height,
       m.duration,
       m.order_index,
       m.created_at AS media_created_at
     FROM quickgram_downloads d
     JOIN quickgram_media m ON m.download_id = d.id
     WHERE d.telegram_user_id = $1
     ORDER BY d.created_at DESC, m.order_index ASC`,
    [telegramUserId]
  );

  const downloads = new Map<string, LibraryDownload>();

  for (const row of result.rows) {
    const downloadId = String(row.download_id);
    const existing =
      downloads.get(downloadId) ??
      ({
        id: downloadId,
        shortcode: String(row.shortcode),
        sourceUrl: row.source_url ? String(row.source_url) : null,
        caption: row.caption ? String(row.caption) : null,
        createdAt: new Date(row.download_created_at).toISOString(),
        media: []
      } satisfies LibraryDownload);

    existing.media.push({
      id: String(row.media_id),
      mediaType: row.media_type as LibraryMediaType,
      url: mediaUrlForId(String(row.media_id)),
      width: rowNumber(row.width),
      height: rowNumber(row.height),
      duration: rowNumber(row.duration),
      orderIndex: Number(row.order_index),
      createdAt: new Date(row.media_created_at).toISOString()
    });

    downloads.set(downloadId, existing);
  }

  return [...downloads.values()];
}

export async function findOwnedMedia(
  mediaId: string,
  telegramUserId: number
): Promise<{ telegramFileId: string; mediaType: LibraryMediaType } | null> {
  const result = await getPool().query(
    `SELECT telegram_file_id, media_type
     FROM quickgram_media
     WHERE id = $1 AND telegram_user_id = $2
     LIMIT 1`,
    [mediaId, telegramUserId]
  );

  const row = result.rows[0] as
    | { telegram_file_id: string; media_type: LibraryMediaType }
    | undefined;
  if (!row) {
    return null;
  }

  return {
    telegramFileId: row.telegram_file_id,
    mediaType: row.media_type
  };
}

export async function runSql(client: pg.PoolClient, sql: string): Promise<void> {
  await client.query(sql);
}
