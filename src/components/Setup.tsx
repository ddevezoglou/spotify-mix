import { useState } from "react";
import { redirectUri, setClientId } from "../spotify/auth";

export function Setup() {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(redirectUri());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setClientId(value);
      location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <main className="wrap">
      <h1>Spotify Mix</h1>
      <div className="card">
        <p>Για να συνδεθείς χρειάζεσαι το δικό σου Spotify Client ID (δωρεάν, 2 λεπτά).</p>
        <ol>
          <li>
            Άνοιξε το <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">Spotify Developer Dashboard</a> και πάτα «Create app».
          </li>
          <li>
            Στο «APIs used» διάλεξε <strong>Web API</strong> και <strong>Web Playback SDK</strong>.
          </li>
          <li>
            Στο «Redirect URI» βάλε: <code>{redirectUri()}</code>{" "}
            <button type="button" className="ghost" onClick={copy}>
              {copied ? "Αντιγράφηκε" : "Αντιγραφή"}
            </button>
          </li>
          <li>
            Αντίγραψε το Client ID από τις ρυθμίσεις της εφαρμογής και κόλλησέ το εδώ:
            <form onSubmit={submit}>
              <input
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError(null);
                }}
                placeholder="Client ID (32 χαρακτήρες)"
                spellCheck={false}
                autoComplete="off"
              />{" "}
              <button type="submit">Αποθήκευση</button>
            </form>
            {error && <p className="error">{error}</p>}
          </li>
        </ol>
      </div>
    </main>
  );
}
