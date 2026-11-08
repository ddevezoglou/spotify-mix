// Phase 0 spike: how many of YOUR tracks have BPM / key / energy from third-party sources?
import { useEffect, useState } from "react";
import { getMyPlaylists, getPlaylistTracks, type Playlist, type Track } from "../spotify/api";
import { getFeatures, type Features } from "../data/features";
import { mmss } from "./format";

export function CoverageTest({ myId }: { myId: string }) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selected, setSelected] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [features, setFeatures] = useState<Map<string, Features>>(new Map());
  const [status, setStatus] = useState("");

  useEffect(() => {
    getMyPlaylists(myId)
      .then((all) => setPlaylists(all.filter((p) => p.owned)))
      .catch((e) => setStatus(String(e)));
  }, [myId]);

  async function analyse() {
    if (!selected) return;
    try {
      setStatus("Φόρτωση tracks…");
      const t = await getPlaylistTracks(selected);
      setTracks(t);
      setStatus(`Ανάλυση ${t.length} tracks…`);
      setFeatures(await getFeatures(t));
      setStatus("");
    } catch (e) {
      setStatus(String(e));
    }
  }

  const rows = tracks.map((t) => ({ t, f: features.get(t.id) }));
  const count = (pred: (f: Features) => boolean) => rows.filter((r) => r.f && pred(r.f)).length;
  const pct = (n: number) => (tracks.length ? `${Math.round((100 * n) / tracks.length)}%` : "—");
  const withBpm = count((f) => f.bpm !== null);
  const withKey = count((f) => f.camelot !== null);
  const outOfRange = count((f) => f.rawBpm !== null && f.bpm === null);

  return (
    <section>
      <div className="card">
        <h2>Κάλυψη δεδομένων</h2>
        <p className="muted">Μόνο δικές σου playlists (κανόνας Spotify Development Mode).</p>
        <div className="row">
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">— διάλεξε playlist —</option>
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button disabled={!selected} onClick={analyse}>
            Ανάλυση
          </button>
          <span className="muted">{status}</span>
        </div>
      </div>

      {tracks.length > 0 && features.size > 0 && (
        <>
          <div className="stats">
            <div>
              <b>{tracks.length}</b>
              <span>tracks</span>
            </div>
            <div>
              <b>{pct(withBpm)}</b>
              <span>με BPM</span>
            </div>
            <div>
              <b>{pct(withKey)}</b>
              <span>με key</span>
            </div>
            <div>
              <b>{outOfRange}</b>
              <span>BPM εκτός 110–150</span>
            </div>
          </div>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Track</th>
                  <th>Διάρκεια</th>
                  <th>BPM (raw → τελικό)</th>
                  <th>Key</th>
                  <th>Energy</th>
                  <th>Πηγή</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ t, f }) => (
                  <tr key={t.id} className={f?.source === "none" ? "missing" : ""}>
                    <td>
                      {t.artists} — {t.name}
                    </td>
                    <td>{mmss(t.durationSec)}</td>
                    <td>
                      {f?.rawBpm ? f.rawBpm.toFixed(1) : "—"} → {f?.bpm ? f.bpm.toFixed(1) : "—"}
                    </td>
                    <td>{f?.camelot ?? "—"}</td>
                    <td>{f?.energy != null ? f.energy.toFixed(2) : "—"}</td>
                    <td>{f?.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
