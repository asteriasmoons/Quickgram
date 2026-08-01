# Quickgram

Quickgram is a Telegram bot and Mini App for downloading Instagram post/reel media and browsing delivered downloads later in a personal Library.

The production runtime is TypeScript:

- Express web server
- grammY Telegram bot
- React + Vite Telegram Mini App
- Postgres library persistence
- `gallery-dl` CLI fallback for Instagram downloads

## Environment Variables

Required:

```bash
BEST_INSTAGRAM_DOWNLOADER_BOT_API=your_telegram_bot_token
DATABASE_URL=postgresql://...
```

Recommended/optional:

```bash
INSTAGRAM_DOWNLOADER_LOG_CHANNEL_ID=-1001234567890
INSTAGRAM_SESSIONID=instagram_session_cookie
INSTAGRAM_CSRFTOKEN=instagram_csrf_cookie
INSTAGRAM_DS_USER_ID=instagram_user_id_for_gallery_dl
INSTAGRAM_DOWNLOADER_METHOD=mobile_api
WEBHOOK_BASE_URL=https://your-service.onrender.com
RENDER_EXTERNAL_URL=https://your-service.onrender.com
TELEGRAM_WEBHOOK_SECRET=stable_secret
FORCE_WEBHOOK_REFRESH=false
MINIAPP_PUBLIC_URL=https://your-service.onrender.com/miniapp
PORT=10000
```

`INSTAGRAM_DOWNLOADER_METHOD` supports:

- `mobile_api`
- `mobile-api`
- `gallery_dl`
- `gallery-dl`

## Local Setup

Install dependencies:

```bash
npm install
npm --prefix miniapp install
```

Create a local Postgres database:

```bash
createdb quickgram_dev
```

Set your local database URL:

```bash
export DATABASE_URL=postgresql://localhost:5432/quickgram_dev
```

Run migrations:

```bash
npm run migrate
```

Build everything:

```bash
npm run build
```

Start the server:

```bash
npm start
```

For frontend-only development:

```bash
npm --prefix miniapp run dev
```

The Vite dev server proxies `/api` to `http://localhost:10000`.

## Render Postgres Setup

1. Open the Render Dashboard.
2. Click `New +`.
3. Choose `PostgreSQL`.
4. Name it something like `quickgram-db`.
5. Put it in the same region as the Quickgram web service.
6. After creation, open the database connection info.
7. Copy the **Internal Database URL**.
8. Add it to the Quickgram web service environment:

```bash
DATABASE_URL=<internal database url>
```

Use Render's internal URL for deployed service-to-database traffic. It stays on Render's private network and avoids unnecessary public network hops.

## Render Deployment

Deploy Quickgram as a Docker-backed web service.

The Dockerfile:

- Installs Node 20.
- Installs Python/pipx.
- Installs the `gallery-dl` CLI.
- Installs backend and Mini App dependencies.
- Builds the React Mini App and TypeScript server.
- Starts the compiled server with `npm start`.

After deploy, run migrations with a one-off job or shell command:

```bash
npm run migrate
```

Then confirm:

```bash
curl https://your-service.onrender.com/health
```

## Telegram Mini App Setup

In BotFather:

1. Open your bot.
2. Configure the Mini App / Web App URL.
3. Use:

```text
https://your-service.onrender.com/miniapp
```

The bot also sends an `Open Quickgram` button from `/start`.

## Library Behavior

Quickgram stores Telegram `file_id`s after successful delivery. It does not store raw media bytes.

The Mini App:

- Validates Telegram Mini App `initData`.
- Shows only the current Telegram user's downloads.
- Proxies media through the backend so the bot token is never exposed.

Historical downloads from the old Python runtime will not appear in Library because they were not persisted.

## Verification

```bash
npm run typecheck
npm test
npm run build
```
