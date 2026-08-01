import { BOT_USERNAME, logChannelId } from "../config.js";

interface TelegramLoggerApi {
  sendMessage(chatId: number, text: string): Promise<unknown>;
}

export async function log(api: TelegramLoggerApi, message: string): Promise<void> {
  const channelId = logChannelId();
  if (!channelId) {
    return;
  }

  try {
    await api.sendMessage(channelId, message);
    console.log("log registered");
  } catch (error) {
    console.log(
      `Error in registering log: ${
        error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      }`
    );
  }
}

export function botLogPrefix(): string {
  return `${BOT_USERNAME} log:`;
}
