import type { Bot } from "grammy";

export async function resolveTelegramFileUrl(
  bot: Bot,
  fileId: string,
  token: string
): Promise<string> {
  const file = await bot.api.getFile(fileId);
  if (!file.file_path) {
    throw new Error("Telegram did not return a file path.");
  }
  return `https://api.telegram.org/file/bot${token}/${file.file_path}`;
}
