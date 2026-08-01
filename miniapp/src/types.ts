export type TabId = "home" | "library";

export interface LibraryMediaItem {
  id: string;
  mediaType: "photo" | "video";
  url: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  orderIndex: number;
  createdAt: string;
}

export interface LibraryDownload {
  id: string;
  shortcode: string;
  sourceUrl: string | null;
  caption: string | null;
  createdAt: string;
  media: LibraryMediaItem[];
}

export interface LibraryDateAlbum {
  dateKey: string;
  latestAt: string;
  downloadCount: number;
  mediaCount: number;
  previewMedia: LibraryMediaItem[];
}
