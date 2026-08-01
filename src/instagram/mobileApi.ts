import { shortcodeToMediaId } from "./shortcode.js";
import type { InstagramFetchResult, InstagramMediaLink } from "./types.js";

const API_BASE_URL = "https://i.instagram.com/api/v1";

class InstagramFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstagramFetchError";
  }
}

interface Candidate {
  url?: string;
  width?: number | string;
  height?: number | string;
}

interface MobileApiMedia {
  image_versions2?: { candidates?: Candidate[] };
  image_versions?: { candidates?: Candidate[] };
  video_versions?: Candidate[];
  carousel_media?: MobileApiMedia[];
  caption?: { text?: string } | string | null;
}

function buildCookieHeader(): string {
  const sessionId = (process.env.INSTAGRAM_SESSIONID ?? "").trim();
  const csrfToken = (process.env.INSTAGRAM_CSRFTOKEN ?? "").trim();

  if (!sessionId) {
    throw new InstagramFetchError("INSTAGRAM_SESSIONID is missing.");
  }

  const cookies = [`sessionid=${sessionId}`];
  if (csrfToken) {
    cookies.push(`csrftoken=${csrfToken}`);
  }
  return cookies.join("; ");
}

function candidateScore(candidate: Candidate): number {
  const width = Number(candidate.width ?? 0);
  const height = Number(candidate.height ?? 0);
  return width * height + width;
}

function bestCandidateUrl(candidates: Candidate[] | undefined): string | null {
  const validCandidates = (candidates ?? []).filter((candidate) => candidate.url);
  if (!validCandidates.length) {
    return null;
  }

  validCandidates.sort((left, right) => candidateScore(right) - candidateScore(left));
  return validCandidates[0]?.url ?? null;
}

function mediaItem(media: MobileApiMedia): InstagramMediaLink | null {
  const videoUrl = bestCandidateUrl(media.video_versions);
  if (videoUrl) {
    return { type: "video", url: videoUrl };
  }

  const imageUrl = bestCandidateUrl(
    media.image_versions2?.candidates ?? media.image_versions?.candidates
  );
  if (imageUrl) {
    return { type: "image", url: imageUrl };
  }

  return null;
}

function extractMediaItems(product: MobileApiMedia): InstagramMediaLink[] {
  const sourceItems = product.carousel_media?.length
    ? product.carousel_media
    : [product];

  return sourceItems
    .map((item) => mediaItem(item))
    .filter((item): item is InstagramMediaLink => item !== null);
}

function extractCaption(product: MobileApiMedia): string {
  if (typeof product.caption === "string") {
    return product.caption;
  }
  if (product.caption && typeof product.caption === "object") {
    return product.caption.text ?? "";
  }
  return "";
}

export async function getInstagramMediaLinksFromMobileApi(
  shortcode: string
): Promise<InstagramFetchResult> {
  try {
    const mediaId = shortcodeToMediaId(shortcode);
    const csrfToken = (process.env.INSTAGRAM_CSRFTOKEN ?? "").trim();
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) " +
        "AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 " +
        "Instagram 335.0.0.39.93",
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "X-IG-App-ID": "936619743392459",
      "X-ASBD-ID": "359341",
      "X-IG-WWW-Claim": "0",
      Origin: "https://www.instagram.com",
      Referer: "https://www.instagram.com/",
      Cookie: buildCookieHeader()
    };

    if (csrfToken) {
      headers["X-CSRFToken"] = csrfToken;
    }

    const response = await fetch(`${API_BASE_URL}/media/${mediaId}/info/`, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(30_000)
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      throw new InstagramFetchError(
        "Instagram redirected the media request; the session may be invalid."
      );
    }
    if (response.status === 401) {
      throw new InstagramFetchError("Instagram rejected the session cookie with HTTP 401.");
    }
    if (response.status === 403) {
      throw new InstagramFetchError("Instagram blocked the mobile media request with HTTP 403.");
    }

    if (!response.ok) {
      throw new InstagramFetchError(`Instagram returned HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as {
      items?: MobileApiMedia[];
      message?: string;
      status?: string;
    };
    const product = payload.items?.[0];
    if (!product) {
      throw new InstagramFetchError(
        `Instagram returned no media item: ${payload.message ?? payload.status ?? "empty response"}`
      );
    }

    const mediaLinks = extractMediaItems(product);
    if (!mediaLinks.length) {
      throw new InstagramFetchError(
        "Instagram returned the post but no downloadable media URLs."
      );
    }

    console.log(
      `Instagram mobile API fetch succeeded for ${shortcode}: ${mediaLinks.length} media item(s).`
    );

    return {
      mediaLinks,
      caption: extractCaption(product)
    };
  } catch (error) {
    console.log(
      `Instagram mobile API fetch failed for ${shortcode}: ${
        error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      }`
    );
    return { mediaLinks: [], caption: "" };
  }
}
