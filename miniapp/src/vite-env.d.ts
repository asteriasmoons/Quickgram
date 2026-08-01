/// <reference types="vite/client" />

interface TelegramWebApp {
  initData: string;
  colorScheme?: "light" | "dark";
  safeAreaInset?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
  contentSafeAreaInset?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
  ready(): void;
  expand(): void;
  isVersionAtLeast?(version: string): boolean;
  openLink?(url: string): void;
  downloadFile?(
    params: {
      url: string;
      file_name: string;
    },
    callback?: (accepted: boolean) => void
  ): void;
  HapticFeedback?: {
    notificationOccurred(type: "error" | "success" | "warning"): void;
  };
}

interface Window {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
}
