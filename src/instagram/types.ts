export type InstagramMediaType = "image" | "video";

export interface InstagramMediaLink {
  type: InstagramMediaType;
  url: string;
}

export interface InstagramFetchResult {
  mediaLinks: InstagramMediaLink[];
  caption: string;
}
