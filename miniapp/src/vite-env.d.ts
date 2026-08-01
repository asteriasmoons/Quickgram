/// <reference types="vite/client" />

interface TelegramWebApp {
  initData: string;
  colorScheme?: "light" | "dark";
  ready(): void;
  expand(): void;
}

interface Window {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
}
