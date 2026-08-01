import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent
} from "react";
import {
  downloadInstagramUrl,
  fetchLibraryAlbums,
  fetchLibraryDateDownloads,
  telegramInitData
} from "./api";
import { navItems } from "./nav";
import type {
  LibraryDateAlbum,
  LibraryDownload,
  LibraryMediaItem,
  TabId
} from "./types";
import "./styles.css";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatAlbumDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return "Today";
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function HomePage({ onOpenLibrary }: { onOpenLibrary: () => void }) {
  const isTelegram = Boolean(telegramInitData());
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">(
    "idle"
  );
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setStatus("error");
      setMessage("Paste an Instagram post or reel URL.");
      return;
    }

    setStatus("submitting");
    setMessage("Downloading and sending it to your Telegram chat...");

    try {
      const result = await downloadInstagramUrl(trimmedUrl);
      setStatus("success");
      setMessage(
        `Sent ${result.deliveredCount ?? 0} item${
          result.deliveredCount === 1 ? "" : "s"
        } to Telegram.`
      );
      setUrl("");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to download that URL.");
    }
  }

  return (
    <main className="page home-page">
      <section className="home-hero">
        <img
          className="brand-mark"
          src={`${import.meta.env.BASE_URL}logo.svg`}
          alt="Quickgram"
        />
        <h1>Quickgram</h1>
        <p>Paste an Instagram post or reel URL and Quickgram will send the media to your Telegram chat.</p>

        <form className="download-form" onSubmit={handleSubmit}>
          <input
            aria-label="Instagram URL"
            inputMode="url"
            placeholder="https://www.instagram.com/p/..."
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <button
            className="primary-action"
            disabled={status === "submitting"}
            type="submit"
          >
            {status === "submitting" ? "Downloading..." : "Download"}
          </button>
        </form>

        {message && (
          <div className={status === "error" ? "status-message error" : "status-message"}>
            {message}
          </div>
        )}

        {status === "success" && (
          <button className="secondary-action" type="button" onClick={onOpenLibrary}>
            View Library
          </button>
        )}
      </section>

      <section className="home-steps" aria-label="Quickgram flow">
        <article>
          <span>1</span>
          <strong>Paste a link</strong>
          <p>Use the input above for any Instagram post or reel URL.</p>
        </article>
        <article>
          <span>2</span>
          <strong>Receive media</strong>
          <p>Quickgram downloads and sends the available files back to you.</p>
        </article>
        <article>
          <span>3</span>
          <strong>Browse later</strong>
          <p>Your delivered photos and videos show up in the Library tab.</p>
        </article>
      </section>

      {!isTelegram && (
        <p className="telegram-warning">
          Open this page from Telegram to load your personal Library.
        </p>
      )}
    </main>
  );
}

function EmptyLibrary() {
  return (
    <section className="empty-state">
      <div className="empty-icon">+</div>
      <h2>Your Library is waiting</h2>
      <p>Downloads will appear here after the bot successfully sends them to you.</p>
    </section>
  );
}

function AlbumCard({
  album,
  onOpen
}: {
  album: LibraryDateAlbum;
  onOpen: (album: LibraryDateAlbum) => void;
}) {
  return (
    <button className="album-card" type="button" onClick={() => onOpen(album)}>
      <div className="album-preview-grid">
        {album.previewMedia.map((media) => (
          <div className="album-preview-frame" key={media.id}>
            {media.mediaType === "video" ? (
              <video src={media.url} preload="metadata" playsInline />
            ) : (
              <img src={media.url} alt="" />
            )}
          </div>
        ))}
      </div>
      <div className="album-card-body">
        <div>
          <strong>{formatAlbumDate(album.dateKey)}</strong>
          <span>{formatDate(album.latestAt)}</span>
        </div>
        <span className="album-count">
          {album.mediaCount} item{album.mediaCount === 1 ? "" : "s"}
        </span>
      </div>
    </button>
  );
}

function absoluteMediaUrl(url: string): string {
  return new URL(url, window.location.origin).toString();
}

function saveFileName(media: LibraryMediaItem): string {
  const extension = media.mediaType === "video" ? "mp4" : "jpg";
  return `quickgram-${media.id}.${extension}`;
}

function MediaViewer({
  media,
  onClose
}: {
  media: LibraryMediaItem;
  onClose: () => void;
}) {
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  function handleSave() {
    const webApp = window.Telegram?.WebApp;

    if (!webApp?.downloadFile) {
      webApp?.HapticFeedback?.notificationOccurred("error");
      setSaveMessage("Native save is not available in this Telegram version.");
      return;
    }

    if (webApp.isVersionAtLeast && !webApp.isVersionAtLeast("8.0")) {
      webApp.HapticFeedback?.notificationOccurred("error");
      setSaveMessage("Update Telegram to use native saving from Mini Apps.");
      return;
    }

    setSaveMessage("Opening Telegram save prompt...");
    webApp.downloadFile(
      {
        url: absoluteMediaUrl(media.url),
        file_name: saveFileName(media)
      },
      (accepted) => {
        webApp.HapticFeedback?.notificationOccurred(accepted ? "success" : "warning");
        setSaveMessage(
          accepted ? "Telegram is saving the file." : "Save was cancelled."
        );
      }
    );
  }

  return (
    <div className="media-viewer" role="dialog" aria-modal="true">
      <button className="viewer-backdrop" type="button" aria-label="Close" onClick={onClose} />
      <div className="viewer-panel">
        <header className="viewer-header">
          <button className="viewer-close" type="button" onClick={onClose}>
            Close
          </button>
          <button
            className="viewer-save"
            type="button"
            onClick={handleSave}
          >
            Save
          </button>
        </header>

        <div className="viewer-media-frame">
          {media.mediaType === "video" ? (
            <video src={media.url} controls autoPlay playsInline />
          ) : (
            <img src={media.url} alt="Selected downloaded media" />
          )}
        </div>

        {saveMessage && <p className="viewer-save-message">{saveMessage}</p>}
      </div>
    </div>
  );
}

function LibraryMedia({
  download,
  onSelectMedia
}: {
  download: LibraryDownload;
  onSelectMedia: (media: LibraryMediaItem) => void;
}) {
  return (
    <article className="download-card">
      <header className="download-header">
        <div>
          <strong>Instagram / {download.shortcode}</strong>
          <span>{formatDate(download.createdAt)}</span>
        </div>
        <span className="media-count">{download.media.length}</span>
      </header>

      <div className="media-grid">
        {download.media.map((item) => (
          <button
            className="media-frame"
            key={item.id}
            type="button"
            onClick={() => onSelectMedia(item)}
          >
            {item.mediaType === "video" ? (
              <>
                <video src={item.url} preload="metadata" playsInline />
                <span className="video-marker">Video</span>
              </>
            ) : (
              <img src={item.url} alt={`Downloaded Instagram media ${item.orderIndex + 1}`} />
            )}
          </button>
        ))}
      </div>

      {download.caption && <p className="caption">{download.caption}</p>}
    </article>
  );
}

function LibraryPage() {
  const [albums, setAlbums] = useState<LibraryDateAlbum[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<LibraryDateAlbum | null>(null);
  const [downloads, setDownloads] = useState<LibraryDownload[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<LibraryMediaItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreAlbums, setHasMoreAlbums] = useState(false);
  const [hasMoreDownloads, setHasMoreDownloads] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAlbums() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchLibraryAlbums();
        if (!cancelled) {
          setAlbums(result.albums);
          setHasMoreAlbums(result.hasMore);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load Library.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadAlbums();

    return () => {
      cancelled = true;
    };
  }, []);

  async function openAlbum(album: LibraryDateAlbum) {
    setSelectedAlbum(album);
    setDownloads([]);
    setLoading(true);
    setError(null);
    try {
      const result = await fetchLibraryDateDownloads(album.dateKey);
      setDownloads(result.downloads);
      setHasMoreDownloads(result.hasMore);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load album.");
    } finally {
      setLoading(false);
    }
  }

  async function loadMoreAlbums() {
    setLoadingMore(true);
    setError(null);
    try {
      const result = await fetchLibraryAlbums(albums.length);
      setAlbums((current) => [...current, ...result.albums]);
      setHasMoreAlbums(result.hasMore);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load more albums.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function loadMoreDownloads() {
    if (!selectedAlbum) {
      return;
    }
    setLoadingMore(true);
    setError(null);
    try {
      const result = await fetchLibraryDateDownloads(
        selectedAlbum.dateKey,
        downloads.length
      );
      setDownloads((current) => [...current, ...result.downloads]);
      setHasMoreDownloads(result.hasMore);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load more media.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <main className="page library-page">
      <header className="page-header">
        {selectedAlbum && (
          <button
            className="back-button"
            type="button"
            onClick={() => {
              setSelectedAlbum(null);
              setDownloads([]);
              setError(null);
            }}
          >
            Library
          </button>
        )}
        <h1>{selectedAlbum ? formatAlbumDate(selectedAlbum.dateKey) : "Library"}</h1>
        <p>
          {selectedAlbum
            ? `${selectedAlbum.mediaCount} photos and videos from this date.`
            : "Photos and videos grouped by download date."}
        </p>
      </header>

      {loading && <div className="loading-card">Loading your Library...</div>}
      {error && <div className="error-card">{error}</div>}
      {!loading && !error && !selectedAlbum && albums.length === 0 && <EmptyLibrary />}
      {!loading && !error && !selectedAlbum && albums.length > 0 && (
        <section className="album-list">
          {albums.map((album) => (
            <AlbumCard key={album.dateKey} album={album} onOpen={openAlbum} />
          ))}
          {hasMoreAlbums && (
            <button
              className="load-more-button"
              type="button"
              disabled={loadingMore}
              onClick={loadMoreAlbums}
            >
              {loadingMore ? "Loading..." : "Load More"}
            </button>
          )}
        </section>
      )}
      {!loading && !error && selectedAlbum && downloads.length === 0 && (
        <EmptyLibrary />
      )}
      {!loading && !error && selectedAlbum && downloads.length > 0 && (
        <section className="download-list">
          {downloads.map((download) => (
            <LibraryMedia
              key={download.id}
              download={download}
              onSelectMedia={setSelectedMedia}
            />
          ))}
          {hasMoreDownloads && (
            <button
              className="load-more-button"
              type="button"
              disabled={loadingMore}
              onClick={loadMoreDownloads}
            >
              {loadingMore ? "Loading..." : "Load More"}
            </button>
          )}
        </section>
      )}

      {selectedMedia && (
        <MediaViewer media={selectedMedia} onClose={() => setSelectedMedia(null)} />
      )}
    </main>
  );
}

function BottomNav({
  activeTab,
  onSelect
}: {
  activeTab: TabId;
  onSelect: (tab: TabId) => void;
}) {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {navItems.map((item) => (
        <button
          aria-current={activeTab === item.id ? "page" : undefined}
          className={activeTab === item.id ? "nav-item active" : "nav-item"}
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
        >
          <span
            className="nav-icon"
            style={{ "--icon-url": `url(${item.icon})` } as CSSProperties}
            aria-hidden="true"
          />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("home");

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    const topInset = Math.max(
      webApp?.safeAreaInset?.top ?? 0,
      webApp?.contentSafeAreaInset?.top ?? 0
    );
    document.documentElement.style.setProperty(
      "--telegram-safe-area-top",
      `${topInset}px`
    );
    webApp?.ready();
    webApp?.expand();
  }, []);

  const page = useMemo(() => {
    if (activeTab === "library") {
      return <LibraryPage />;
    }
    return <HomePage onOpenLibrary={() => setActiveTab("library")} />;
  }, [activeTab]);

  return (
    <div className="app-shell">
      {page}
      <BottomNav activeTab={activeTab} onSelect={setActiveTab} />
    </div>
  );
}
