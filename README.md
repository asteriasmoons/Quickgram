# Quickgram

Quickgram is a Telegram bot and Mini App for downloading Instagram post/reel media and browsing delivered downloads later in a personal Library.

The production runtime is TypeScript:

- Express web server
- grammY Telegram bot
- React + Vite Telegram Mini App
- Postgres library persistence
- `gallery-dl` CLI fallback for Instagram downloads

## Environment Variables

When creating the new Docker service on Render, copy every existing environment
variable from the old Quickgram service first, then add `DATABASE_URL`.

Current project variables:

```bash
BEST_INSTAGRAM_DOWNLOADER_BOT_API=your_telegram_bot_token
INSTAGRAM_DOWNLOADER_LOG_CHANNEL_ID=-1001234567890
INSTAGRAM_DOWNLOADER_METHOD=mobile_api
INSTAGRAM_SESSIONID=instagram_session_cookie
INSTAGRAM_USERNAME=instagram_username
DATABASE_URL=postgresql://...
```

Additional optional variables:

```bash
INSTAGRAM_CSRFTOKEN=instagram_csrf_cookie
INSTAGRAM_DS_USER_ID=instagram_user_id_for_gallery_dl
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

`INSTAGRAM_USERNAME` is kept in the environment template because the existing
service has it. The current TypeScript downloader uses `INSTAGRAM_SESSIONID`
for authenticated Instagram requests, but preserving the username during the
Render migration prevents accidental config loss.

For the deployed Render service, `WEBHOOK_BASE_URL` must be the active Docker
service URL, not an old suspended Python service URL. `MINIAPP_PUBLIC_URL` must
match the same active service plus `/miniapp`.

```bash
WEBHOOK_BASE_URL=https://your-active-service.onrender.com
MINIAPP_PUBLIC_URL=https://your-active-service.onrender.com/miniapp
FORCE_WEBHOOK_REFRESH=true
```

Set `FORCE_WEBHOOK_REFRESH=true` for one deploy after changing URLs so Telegram
gets the new webhook, then set it back to `false`.

## Local Setup

Install dependencies:

```bash
npm install
npm --prefix miniapp install
```

### Option A: Local Postgres

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

### Option B: Render Postgres From Your Terminal

You can run migrations from your own terminal on the free Render tier. Use the
database's **External Database URL** locally:

```bash
DATABASE_URL=<external database url from Render> npm run migrate
```

Or put the External Database URL in your local `.env` as `DATABASE_URL`, then run:

```bash
npm run migrate
```

Do not use the Internal Database URL from your Mac. Render internal hostnames
look like `dpg-...` and only resolve from inside Render services. The deployed
Render web service should still use the Internal Database URL.

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

For local terminal commands, use the **External Database URL** instead.

## Render Deployment

Deploy Quickgram as a Docker-backed web service.

The Dockerfile:

- Installs Node 20.
- Installs Python/pipx.
- Installs the `gallery-dl` CLI.
- Installs backend and Mini App dependencies.
- Builds the React Mini App and TypeScript server.
- Starts the compiled server with `npm start`.

After deploy, run migrations from your own terminal using the External Database URL:

```bash
DATABASE_URL=<external database url from Render> npm run migrate
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

If Telegram shows `This service has been suspended`, the Mini App URL is still
pointing at a suspended Render service. Update both BotFather and the Render
service env vars to the active Docker service URL.

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
