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
  openLink?(url: string): void;
}

interface Window {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
}
