import { getInstagramMediaLinksFromGalleryDl } from "./galleryDl.js";
import { getInstagramMediaLinksFromMobileApi } from "./mobileApi.js";
import type { InstagramFetchResult } from "./types.js";

const METHOD_ALIASES: Record<string, "mobile_api" | "gallery_dl"> = {
  mobile_api: "mobile_api",
  "mobile-api": "mobile_api",
  gallery_dl: "gallery_dl",
  "gallery-dl": "gallery_dl"
};

function selectedMethod(): "mobile_api" | "gallery_dl" {
  const rawMethod = (process.env.INSTAGRAM_DOWNLOADER_METHOD ?? "gallery-dl")
    .trim()
    .toLowerCase();
  const method = METHOD_ALIASES[rawMethod];
  if (!method) {
    throw new Error(
      `Unsupported INSTAGRAM_DOWNLOADER_METHOD=${rawMethod}. ` +
        `Supported values: ${Object.keys(METHOD_ALIASES).sort().join(", ")}`
    );
  }
  return method;
}

export async function getInstagramMediaLinks(
  shortcode: string
): Promise<InstagramFetchResult> {
  const method = selectedMethod();
  console.log(`Quickgram downloader method: ${method}`);

  if (method === "gallery_dl") {
    return getInstagramMediaLinksFromGalleryDl(shortcode);
  }

  return getInstagramMediaLinksFromMobileApi(shortcode);
}
