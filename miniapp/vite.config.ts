import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? "/miniapp/",
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:10000"
    }
  }
});
