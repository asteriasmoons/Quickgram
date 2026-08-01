import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { fetchLibrary, telegramInitData } from "./api";
import { navItems } from "./nav";
import type { LibraryDownload, TabId } from "./types";
import "./styles.css";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function HomePage({ onOpenLibrary }: { onOpenLibrary: () => void }) {
  const isTelegram = Boolean(telegramInitData());

  return (
    <main className="page home-page">
      <section className="home-hero">
        <div className="brand-mark">Q</div>
        <h1>Quickgram</h1>
        <p>
          Send an Instagram post or reel to the bot. The media you receive will
          appear here automatically.
        </p>
        <button className="primary-action" type="button" onClick={onOpenLibrary}>
          Open Library
        </button>
      </section>

      <section className="home-steps" aria-label="Quickgram flow">
        <article>
          <span>1</span>
          <strong>Send a link</strong>
          <p>Paste an Instagram post or reel into the Telegram chat.</p>
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

function LibraryMedia({ download }: { download: LibraryDownload }) {
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
          <div className="media-frame" key={item.id}>
            {item.mediaType === "video" ? (
              <video src={item.url} controls preload="metadata" playsInline />
            ) : (
              <img src={item.url} alt={`Downloaded Instagram media ${item.orderIndex + 1}`} />
            )}
          </div>
        ))}
      </div>

      {download.caption && <p className="caption">{download.caption}</p>}
    </article>
  );
}

function LibraryPage() {
  const [downloads, setDownloads] = useState<LibraryDownload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadLibrary() {
      setLoading(true);
      setError(null);
      try {
        const nextDownloads = await fetchLibrary();
        if (!cancelled) {
          setDownloads(nextDownloads);
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

    void loadLibrary();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="page library-page">
      <header className="page-header">
        <h1>Library</h1>
        <p>Photos and videos the bot has delivered to you.</p>
      </header>

      {loading && <div className="loading-card">Loading your Library...</div>}
      {error && <div className="error-card">{error}</div>}
      {!loading && !error && downloads.length === 0 && <EmptyLibrary />}
      {!loading && !error && downloads.length > 0 && (
        <section className="download-list">
          {downloads.map((download) => (
            <LibraryMedia key={download.id} download={download} />
          ))}
        </section>
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
