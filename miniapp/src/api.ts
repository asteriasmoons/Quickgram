import type { LibraryDateAlbum, LibraryDownload } from "./types";

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "");

function apiUrl(path: string): string {
  if (!configuredApiBaseUrl) {
    return path;
  }
  return `${configuredApiBaseUrl}${path}`;
}

interface LibraryResponse {
  ok: boolean;
  downloads?: LibraryDownload[];
  error?: string;
}

interface DownloadResponse {
  ok: boolean;
  shortcode?: string;
  deliveredCount?: number;
  error?: string;
}

interface AlbumsResponse {
  ok: boolean;
  albums?: LibraryDateAlbum[];
  hasMore?: boolean;
  error?: string;
}

interface DateDownloadsResponse {
  ok: boolean;
  downloads?: LibraryDownload[];
  hasMore?: boolean;
  error?: string;
}

function initDataFromLocation(): string {
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const encodedInitData =
    searchParams.get("tgWebAppData") ?? hashParams.get("tgWebAppData");

  return encodedInitData ? decodeURIComponent(encodedInitData) : "";
}

export function telegramInitData(): string {
  return window.Telegram?.WebApp?.initData || initDataFromLocation();
}

function telegramDiagnostics(): string {
  const hasTelegramObject = Boolean(window.Telegram);
  const hasWebApp = Boolean(window.Telegram?.WebApp);
  const searchHasData = new URLSearchParams(window.location.search).has("tgWebAppData");
  const hashHasData = new URLSearchParams(window.location.hash.replace(/^#/, "")).has(
    "tgWebAppData"
  );

  return `Telegram object: ${hasTelegramObject ? "yes" : "no"}, WebApp: ${
    hasWebApp ? "yes" : "no"
  }, URL data: ${searchHasData || hashHasData ? "yes" : "no"}.`;
}

export async function fetchLibrary(): Promise<LibraryDownload[]> {
  const initData = telegramInitData();
  if (!initData) {
    throw new Error(
      `Telegram did not provide Mini App auth data. ${telegramDiagnostics()}`
    );
  }

  const response = await fetch(apiUrl("/api/miniapp/library"), {
    headers: {
      "x-telegram-init-data": initData
    }
  });
  const payload = (await response.json()) as LibraryResponse;

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? "Unable to load your library.");
  }

  return payload.downloads ?? [];
}

function userTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export async function fetchLibraryAlbums(
  offset = 0,
  limit = 30
): Promise<{ albums: LibraryDateAlbum[]; hasMore: boolean }> {
  const initData = telegramInitData();
  if (!initData) {
    throw new Error(
      `Telegram did not provide Mini App auth data. ${telegramDiagnostics()}`
    );
  }

  const params = new URLSearchParams({
    timezone: userTimezone(),
    offset: String(offset),
    limit: String(limit)
  });
  const response = await fetch(apiUrl(`/api/miniapp/library/albums?${params}`), {
    headers: {
      "x-telegram-init-data": initData
    }
  });
  const payload = (await response.json()) as AlbumsResponse;

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? "Unable to load Library albums.");
  }

  return {
    albums: payload.albums ?? [],
    hasMore: Boolean(payload.hasMore)
  };
}

export async function fetchLibraryDateDownloads(
  dateKey: string,
  offset = 0,
  limit = 20
): Promise<{ downloads: LibraryDownload[]; hasMore: boolean }> {
  const initData = telegramInitData();
  if (!initData) {
    throw new Error(
      `Telegram did not provide Mini App auth data. ${telegramDiagnostics()}`
    );
  }

  const params = new URLSearchParams({
    timezone: userTimezone(),
    offset: String(offset),
    limit: String(limit)
  });
  const response = await fetch(
    apiUrl(`/api/miniapp/library/albums/${encodeURIComponent(dateKey)}?${params}`),
    {
      headers: {
        "x-telegram-init-data": initData
      }
    }
  );
  const payload = (await response.json()) as DateDownloadsResponse;

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? "Unable to load that album.");
  }

  return {
    downloads: payload.downloads ?? [],
    hasMore: Boolean(payload.hasMore)
  };
}

export async function downloadInstagramUrl(url: string): Promise<DownloadResponse> {
  const initData = telegramInitData();
  if (!initData) {
    throw new Error(
      `Telegram did not provide Mini App auth data. ${telegramDiagnostics()}`
    );
  }

  const response = await fetch(apiUrl("/api/miniapp/download"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-init-data": initData
    },
    body: JSON.stringify({ url })
  });
  const payload = (await response.json()) as DownloadResponse;

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? "Unable to download that URL.");
  }

  return payload;
}
