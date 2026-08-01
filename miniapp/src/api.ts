import type { LibraryDownload } from "./types";

interface LibraryResponse {
  ok: boolean;
  downloads?: LibraryDownload[];
  error?: string;
}

export function telegramInitData(): string {
  return window.Telegram?.WebApp?.initData ?? "";
}

export async function fetchLibrary(): Promise<LibraryDownload[]> {
  const response = await fetch("/api/miniapp/library", {
    headers: {
      "x-telegram-init-data": telegramInitData()
    }
  });
  const payload = (await response.json()) as LibraryResponse;

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? "Unable to load your library.");
  }

  return payload.downloads ?? [];
}
