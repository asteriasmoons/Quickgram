import pg from "pg";
import { databaseUrl } from "../config.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

function throwIfLocalRenderInternalUrl(connectionString: string): void {
  if (process.env.RENDER) {
    return;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(connectionString);
  } catch {
    return;
  }

  const looksLikeRenderInternalHost =
    parsedUrl.hostname.startsWith("dpg-") && !parsedUrl.hostname.includes(".");

  if (looksLikeRenderInternalHost) {
    throw new Error(
      "DATABASE_URL is a Render Internal Database URL. That only works from inside Render. " +
        "For local `npm run migrate`, paste the Render External Database URL into your local .env as DATABASE_URL. " +
        "Keep the Internal Database URL in the Render web service environment."
    );
  }
}

export function hasDatabaseConfig(): boolean {
  return databaseUrl() !== null;
}

export function getPool(): pg.Pool {
  const connectionString = databaseUrl();
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  throwIfLocalRenderInternalUrl(connectionString);

  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl:
        connectionString.includes("localhost") ||
        connectionString.includes("127.0.0.1")
          ? false
          : { rejectUnauthorized: false }
    });
  }

  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
