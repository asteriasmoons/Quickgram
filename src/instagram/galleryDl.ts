import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { InstagramFetchResult, InstagramMediaLink } from "./types.js";

function mediaType(url: string): InstagramMediaLink["type"] {
  const pathname = new URL(url).pathname.toLowerCase();
  return pathname.endsWith(".mp4") ||
    pathname.endsWith(".mov") ||
    pathname.endsWith(".m4v") ||
    pathname.endsWith(".webm")
    ? "video"
    : "image";
}

async function createCookieFile(): Promise<string> {
  const sessionId = (process.env.INSTAGRAM_SESSIONID ?? "").trim();
  const csrfToken = (process.env.INSTAGRAM_CSRFTOKEN ?? "").trim();
  const dsUserId = (process.env.INSTAGRAM_DS_USER_ID ?? "").trim();

  if (!sessionId) {
    throw new Error("INSTAGRAM_SESSIONID is required when using gallery-dl.");
  }

  const lines = [
    "# Netscape HTTP Cookie File",
    "# Generated temporarily by Quickgram for gallery-dl",
    `.instagram.com\tTRUE\t/\tTRUE\t2147483647\tsessionid\t${sessionId}`
  ];

  if (csrfToken) {
    lines.push(`.instagram.com\tTRUE\t/\tTRUE\t2147483647\tcsrftoken\t${csrfToken}`);
  }
  if (dsUserId) {
    lines.push(`.instagram.com\tTRUE\t/\tTRUE\t2147483647\tds_user_id\t${dsUserId}`);
  }

  const filename = path.join(
    os.tmpdir(),
    `quickgram-gallery-dl-cookies-${process.pid}-${Date.now()}.txt`
  );
  await fs.writeFile(filename, `${lines.join("\n")}\n`, "utf8");
  return filename;
}

function runGalleryDl(command: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0] ?? "gallery-dl", command.slice(1), {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("gallery-dl timed out."));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (stderr.trim()) {
        console.log(`gallery-dl output: ${stderr.trim()}`);
      }
      if (code !== 0) {
        reject(new Error(`gallery-dl exited with status ${code}.`));
        return;
      }
      resolve(stdout);
    });
  });
}

export async function getInstagramMediaLinksFromGalleryDl(
  shortcode: string
): Promise<InstagramFetchResult> {
  let cookieFilePath: string | null = null;

  try {
    cookieFilePath = await createCookieFile();
    console.log("gallery-dl loaded Instagram cookies from a temporary cookie file.");

    const stdout = await runGalleryDl(
      [
        "gallery-dl",
        "--get-urls",
        "--cookies",
        cookieFilePath,
        `https://www.instagram.com/p/${shortcode}/`
      ],
      90_000
    );

    const seen = new Set<string>();
    const mediaLinks = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("http://") || line.startsWith("https://"))
      .filter((url) => {
        if (seen.has(url)) {
          return false;
        }
        seen.add(url);
        return true;
      })
      .map((url) => ({ type: mediaType(url), url }));

    if (!mediaLinks.length) {
      throw new Error("gallery-dl returned no downloadable media URLs.");
    }

    console.log(
      `gallery-dl Instagram fetch succeeded for ${shortcode}: ${mediaLinks.length} media item(s).`
    );

    return { mediaLinks, caption: "" };
  } catch (error) {
    console.log(
      `gallery-dl Instagram fetch failed for shortcode ${shortcode}: ${
        error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      }`
    );
    return { mediaLinks: [], caption: "" };
  } finally {
    if (cookieFilePath) {
      await fs.rm(cookieFilePath, { force: true }).catch(() => undefined);
    }
  }
}
