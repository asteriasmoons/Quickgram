import pg from "pg";
import { databaseUrl } from "../config.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function hasDatabaseConfig(): boolean {
  return databaseUrl() !== null;
}

export function getPool(): pg.Pool {
  const connectionString = databaseUrl();
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

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
