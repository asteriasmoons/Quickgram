import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import {
  ALLOWED_UPDATES,
  WEBHOOK_MAX_CONNECTIONS,
  WEBHOOK_PATH,
  shouldForceWebhookRefresh,
  webhookSecret,
  webhookUrl
} from "./config.js";
import { createBot, expressWebhookCallback } from "./bot/index.js";
import { createMiniAppRouter } from "./routes/miniapp.js";
import { miniAppCors } from "./routes/cors.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizedUpdates(updates: readonly string[] | undefined): string[] {
  return [...(updates ?? [])].sort();
}

async function registerWebhook(bot: ReturnType<typeof createBot>): Promise<{
  registered: boolean;
  changedOnStartup: boolean;
}> {
  const expectedUrl = webhookUrl().replace(/\/+$/, "");
  const expectedUpdates = normalizedUpdates(ALLOWED_UPDATES);

  try {
    const webhookInfo = await bot.api.getWebhookInfo();
    const currentUrl = (webhookInfo.url ?? "").replace(/\/+$/, "");
    const currentUpdates = normalizedUpdates(webhookInfo.allowed_updates);
    const currentMaxConnections = webhookInfo.max_connections;

    const configurationMatches =
      currentUrl === expectedUrl &&
      JSON.stringify(currentUpdates) === JSON.stringify(expectedUpdates) &&
      currentMaxConnections === WEBHOOK_MAX_CONNECTIONS;

    if (configurationMatches && !shouldForceWebhookRefresh()) {
      console.log("Quickgram webhook already configured; no changes needed.");
      return { registered: true, changedOnStartup: false };
    }

    await bot.api.setWebhook(expectedUrl, {
      secret_token: webhookSecret(),
      allowed_updates: [...ALLOWED_UPDATES],
      drop_pending_updates: false,
      max_connections: WEBHOOK_MAX_CONNECTIONS
    });

    console.log(`Quickgram Telegram webhook registered: ${expectedUrl}`);
    return { registered: true, changedOnStartup: true };
  } catch (error) {
    console.log(
      `Quickgram webhook registration failed: ${
        error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      }`
    );
    throw error;
  }
}

async function main(): Promise<void> {
  const bot = createBot();
  const app = express();
  let webhookRegistered = false;
  let webhookChangedOnStartup = false;

  app.use(express.json({ limit: "2mb" }));

  app.post(WEBHOOK_PATH, (request, response, next) => {
    const suppliedSecret = request.header("X-Telegram-Bot-Api-Secret-Token") ?? "";
    if (suppliedSecret !== webhookSecret()) {
      response.sendStatus(403);
      return;
    }
    next();
  });
  app.post(WEBHOOK_PATH, expressWebhookCallback(bot));

  app.use("/api/miniapp", miniAppCors, createMiniAppRouter(bot));

  const miniAppDist = path.resolve(__dirname, "../miniapp/dist");
  if (fs.existsSync(miniAppDist)) {
    app.use("/miniapp", express.static(miniAppDist));
    app.get("/miniapp/*", (_request, response) => {
      response.sendFile(path.join(miniAppDist, "index.html"));
    });
  }

  app.get("/", (_request, response) => {
    response.json({
      ok: true,
      service: "quickgram",
      telegram_mode: "webhook",
      webhook_registered: webhookRegistered,
      webhook_changed_on_startup: webhookChangedOnStartup,
      webhook_url: webhookUrl()
    });
  });

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      service: "quickgram",
      telegram_mode: "webhook",
      webhook_registered: webhookRegistered,
      webhook_changed_on_startup: webhookChangedOnStartup
    });
  });

  const webhookState = await registerWebhook(bot);
  webhookRegistered = webhookState.registered;
  webhookChangedOnStartup = webhookState.changedOnStartup;

  const port = Number(process.env.PORT ?? "10000");
  app.listen(port, "0.0.0.0", () => {
    console.log(`Quickgram TypeScript server listening on port ${port}.`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
