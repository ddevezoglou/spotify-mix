import { useEffect, useState } from "react";
import { getAccessToken, handleRedirect, hasClientId, login, logout, redirectUri } from "./spotify/auth";
import { getMe } from "./spotify/api";
import { PlayerTest } from "./components/PlayerTest";
import { CoverageTest } from "./components/CoverageTest";

type Tab = "player" | "coverage";

export function App() {
  const [me, setMe] = useState<{ id: string; display_name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("player");

  useEffect(() => {
    (async () => {
      try {
        await handleRedirect();
        if (await getAccessToken()) setMe(await getMe());
      } catch (e) {
        setError(String(e instanceof Error ? e.message : e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (!hasClientId()) {
    return (
      <main className="wrap">
        <h1>Spotify Mix</h1>
        <div className="card">
          <p>Λείπει το Spotify Client ID.</p>
          <ol>
            <li>
              Φτιάξε app στο <a href="https://developer.spotify.com/dashboard">Spotify Developer Dashboard</a> (Web API + Web Playback SDK).
            </li>
            <li>
              Redirect URI: <code>{redirectUri()}</code>
            </li>
            <li>
              Βάλε το Client ID στο <code>.env.local</code> ως <code>VITE_SPOTIFY_CLIENT_ID=...</code> και ξανατρέξε <code>npm run dev</code>.
            </li>
          </ol>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap">
      <header className="top">
        <h1>Spotify Mix</h1>
        {me && (
          <div className="who">
            {me.display_name}
            <button
              className="ghost"
              onClick={() => {
                logout();
                setMe(null);
              }}
            >
              Αποσύνδεση
            </button>
          </div>
        )}
      </header>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Φόρτωση…</p>}

      {!loading && !me && (
        <div className="card center">
          <p>Σύνδεση με τον λογαριασμό σου στο Spotify (χρειάζεται Premium).</p>
          <button onClick={() => login().catch((e) => setError(String(e.message ?? e)))}>Σύνδεση με Spotify</button>
        </div>
      )}

      {me && (
        <>
          <nav className="tabs">
            <button className={tab === "player" ? "on" : ""} onClick={() => setTab("player")}>
              Player test
            </button>
            <button className={tab === "coverage" ? "on" : ""} onClick={() => setTab("coverage")}>
              Coverage test
            </button>
          </nav>
          {tab === "player" ? <PlayerTest /> : <CoverageTest myId={me.id} />}
        </>
      )}
    </main>
  );
}
