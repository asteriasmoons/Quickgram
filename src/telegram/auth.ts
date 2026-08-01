import crypto from "node:crypto";
import { botToken } from "../config.js";

export interface TelegramWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  allows_write_to_pm?: boolean;
  photo_url?: string;
}

export interface ValidatedTelegramInitData {
  user: TelegramWebAppUser;
  authDate: Date;
}

const DEFAULT_MAX_AGE_SECONDS = 24 * 60 * 60;

function timingSafeEqualHex(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function validateTelegramInitData(
  initData: string,
  maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS
): ValidatedTelegramInitData {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    throw new Error("Telegram init data is missing hash.");
  }

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken())
    .digest();
  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (!timingSafeEqualHex(calculatedHash, hash)) {
    throw new Error("Telegram init data hash is invalid.");
  }

  const authDateRaw = params.get("auth_date");
  const authDateSeconds = authDateRaw ? Number(authDateRaw) : NaN;
  if (!Number.isFinite(authDateSeconds)) {
    throw new Error("Telegram init data is missing auth_date.");
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - authDateSeconds;
  if (ageSeconds > maxAgeSeconds) {
    throw new Error("Telegram init data is expired.");
  }

  const rawUser = params.get("user");
  if (!rawUser) {
    throw new Error("Telegram init data is missing user.");
  }

  const user = JSON.parse(rawUser) as TelegramWebAppUser;
  if (!Number.isFinite(user.id)) {
    throw new Error("Telegram init data user is missing id.");
  }

  return {
    user,
    authDate: new Date(authDateSeconds * 1000)
  };
}
