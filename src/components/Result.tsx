import { useState } from "react";
import { saveSet } from "../data/sets";
import type { SetPlan } from "../mix/plan";
import type { ExcludeReason } from "../mix/select";
import { addItems, createPlaylist } from "../spotify/api";
import { mmss } from "./format";

const REASONS: Record<ExcludeReason, string> = {
  "no-data": "λείπουν στοιχεία",
  bpm: "εκτός BPM",
  mood: "διάθεση",
  genre: "είδος",
  sound: "ήχος",
  duplicate: "διπλό",
};

export function Result({ plan, onBack }: { plan: SetPlan; onBack(): void }) {
  const { spec, items, coverage, shortfallMin, selection } = plan;
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; url: string } | null>(null);
  const [done, setDone] = useState(false);

  const grouped = new Map<ExcludeReason, string[]>();
  for (const { profile, reason } of selection.excluded) {
    const list = grouped.get(reason) ?? [];
    list.push(`${profile.track.name} — ${profile.track.artists}`);
    grouped.set(reason, list);
  }

  async function create() {
    setCreating(true);
    setError(null);
    try {
      let pl = created;
      if (!pl) {
        const description = `Spotify Mix · ${spec.genres.join(", ")} · ${spec.bpm[0]}–${spec.bpm[1]} BPM · ${spec.durationMin}′`;
        pl = await createPlaylist(spec.name, description);
        setCreated(pl); // keep the link even if adding items fails; a retry reuses this playlist
      }
      await addItems(pl.id, items.map((i) => i.profile.track.uri));
      saveSet(plan, pl.url);
      setDone(true);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <section>
      <button className="ghost" onClick={onBack}>
        ← Νέο set
      </button>
      <div className="card">
        <h2>{spec.name}</h2>
        {coverage.failed > 0 ? (
          <>
            <p>Κάλυψη δεδομένων: {coverage.enoughPct}%</p>
            <p className="error">{coverage.failed} αναζητήσεις απέτυχαν, δοκίμασε ξανά.</p>
          </>
        ) : (
          <p className={coverage.go ? "" : "error"}>
            {coverage.go
              ? `Κάλυψη δεδομένων: ${coverage.enoughPct}% ✓`
              : `Κάλυψη δεδομένων: ${coverage.enoughPct}%, κάτω από 80%. Πολλά tracks αποκλείστηκαν επειδή λείπουν στοιχεία.`}
          </p>
        )}
        {shortfallMin > 0 && (
          <p className="muted">
            Βρέθηκαν tracks για {spec.durationMin - shortfallMin} λεπτά από τα {spec.durationMin} που ζήτησες. Δεν γεμίσαμε με
            tracks που δεν ταιριάζουν.
          </p>
        )}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Track</th>
              <th>BPM</th>
              <th>Key</th>
              <th>Energy</th>
              <th>Ρόλος</th>
              <th>Τμήμα</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.profile.track.id}>
                <td>{i + 1}</td>
                <td>
                  {it.profile.track.name} <span className="muted">{it.profile.track.artists}</span>
                </td>
                <td>{it.profile.features.bpm !== null ? Math.round(it.profile.features.bpm) : "—"}</td>
                <td>{it.profile.features.camelot ?? "—"}</td>
                <td>{it.profile.features.energy !== null ? it.profile.features.energy.toFixed(2) : "—"}</td>
                <td>{it.role}</td>
                <td>
                  {mmss(it.segment.startSec)}–{mmss(it.segment.endSec)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="card">
        <summary>Αποκλείστηκαν ({selection.excluded.length})</summary>
        {[...grouped.entries()].map(([reason, names]) => (
          <div key={reason}>
            <h3>
              {REASONS[reason]} ({names.length})
            </h3>
            <ul className="muted">
              {names.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        ))}
      </details>

      <div className="row">
        {!done && (
          <button disabled={creating || items.length === 0} onClick={create}>
            Δημιουργία playlist στο Spotify
          </button>
        )}
        {created && (
          <a href={created.url} target="_blank" rel="noreferrer">
            Άνοιγμα στο Spotify
          </a>
        )}
      </div>
      {error && (
        <p className="error">
          {error}{" "}
          <button className="ghost" onClick={create} disabled={creating}>
            Δοκίμασε ξανά
          </button>
        </p>
      )}
    </section>
  );
}
