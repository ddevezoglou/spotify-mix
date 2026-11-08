import { useEffect, useState } from "react";
import { clearClientId, getAccessToken, getClientId, handleRedirect, login, logout } from "./spotify/auth";
import { getMe } from "./spotify/api";
import { PlayerTest } from "./components/PlayerTest";
import { INITIAL_FORM, NewSet, type NewSetForm } from "./components/NewSet";
import { Result } from "./components/Result";
import type { SetPlan } from "./mix/plan";
import { Setup } from "./components/Setup";

export function App() {
  const [me, setMe] = useState<{ id: string; display_name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<SetPlan | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [form, setForm] = useState<NewSetForm>(INITIAL_FORM);

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
            <button className={showPlayer ? "" : "on"} onClick={() => setShowPlayer(false)}>
              Set
            </button>
            <button className={showPlayer ? "on" : ""} onClick={() => setShowPlayer(true)}>
              Δοκιμή player
            </button>
          </nav>
          {showPlayer ? (
            <PlayerTest />
          ) : plan ? (
            <Result plan={plan} onBack={() => setPlan(null)} />
          ) : (
            <NewSet myId={me.id} form={form} onForm={(patch) => setForm((f) => ({ ...f, ...patch }))} onPlan={setPlan} />
          )}
        </>
      )}
    </main>
  );
}
