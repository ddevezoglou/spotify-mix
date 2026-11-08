import { useEffect, useState } from "react";
import { clearClientId, getAccessToken, getClientId, handleRedirect, login, logout } from "./spotify/auth";
import { getMe } from "./spotify/api";
import { PlayerTest } from "./components/PlayerTest";
import { CoverageTest } from "./components/CoverageTest";
import { Setup } from "./components/Setup";

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

  if (!getClientId()) return <Setup />;

  return (
    <main className="wrap">
      <header className="top">
        <h1>Spotify Mix</h1>
        <div className="who">
          <button
            className="ghost"
            onClick={() => {
              clearClientId();
              location.reload();
            }}
          >
            Αλλαγή Client ID
          </button>
          {me && (
            <>
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
            </>
          )}
        </div>
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
