import { INSTA_POST_OR_REEL_REGEX } from "../config.js";

const ENCODING_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function getPostOrReelShortcodeFromLink(link: string): string | null {
  const match = INSTA_POST_OR_REEL_REGEX.exec(link);
  return match?.[2] ?? null;
}

export function shortcodeToMediaId(shortcode: string): string {
  let mediaId = 0n;

  for (const character of shortcode) {
    const value = ENCODING_CHARS.indexOf(character);
    if (value === -1) {
      throw new Error(`Invalid Instagram shortcode character: ${character}`);
    }
    mediaId = mediaId * 64n + BigInt(value);
  }

  return mediaId.toString();
}
