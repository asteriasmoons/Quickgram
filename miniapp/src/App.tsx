import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent
} from "react";
import { downloadInstagramUrl, fetchLibrary, telegramInitData } from "./api";
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
        <div className="brand-mark">Q</div>
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
