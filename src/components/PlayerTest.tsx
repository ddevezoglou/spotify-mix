// Phase 0 spike: can we play only part of each track and move between tracks with a fade?
import { useEffect, useRef, useState } from "react";
import { searchTracks, type Track } from "../spotify/api";
import { createPlayer, runSet, type BrowserPlayer, type SetItem } from "../spotify/player";
import { getFeatures, type Features } from "../data/features";
import { planSegment, type SegmentMode } from "../mix/music";
import { mmss } from "./format";

export function PlayerTest() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [queue, setQueue] = useState<Track[]>([]);
  const [features, setFeatures] = useState<Map<string, Features>>(new Map());
  const [mode, setMode] = useState<SegmentMode>("fast");
  const [fadeSec, setFadeSec] = useState(3);
  const [player, setPlayer] = useState<BrowserPlayer | null>(null);
  const [status, setStatus] = useState("");
  const [now, setNow] = useState<{ index: number; pos: number } | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

  useEffect(() => {
    if (queue.length) void getFeatures(queue).then(setFeatures);
  }, [queue]);

  const items: SetItem[] = queue.map((track) => ({
    track,
    segment: planSegment({ durationSec: track.durationSec, bpm: features.get(track.id)?.bpm ?? null, mode }),
  }));

  async function search() {
    if (!query.trim()) return;
    try {
      setResults(await searchTracks(query));
    } catch (e) {
      setStatus(String(e));
    }
  }

  async function play() {
    try {
      let bp = player;
      if (!bp) {
        setStatus("Σύνδεση player…");
        bp = await createPlayer();
        setPlayer(bp);
      }
      stopRef.current?.();
      setStatus("Παίζει");
      stopRef.current = runSet(bp, items, {
        fadeMs: fadeSec * 1000,
        volume: 0.8,
        onTrack: (index) => setNow({ index, pos: items[index].segment.startSec }),
        onProgress: (index, pos) => setNow({ index, pos }),
      });
    } catch (e) {
      setStatus(String(e instanceof Error ? e.message : e));
    }
  }

  function stop() {
    stopRef.current?.();
    stopRef.current = null;
    setNow(null);
    setStatus("Σταμάτησε");
  }

  return (
    <section>
      <div className="card">
        <h2>1. Διάλεξε tracks</h2>
        <div className="row">
          <input
            value={query}
            placeholder="π.χ. Charlotte de Witte"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
          <button onClick={search}>Αναζήτηση</button>
        </div>
        <ul className="list">
          {results.map((t) => (
            <li key={t.id}>
              <span>
                {t.artists} — {t.name} <span className="muted">{mmss(t.durationSec)}</span>
              </span>
              <button className="ghost" onClick={() => setQueue((q) => (q.some((x) => x.id === t.id) ? q : [...q, t]))}>
                + Προσθήκη
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2>2. Set</h2>
        <div className="row">
          <label>
            Τμήμα:{" "}
            <select value={mode} onChange={(e) => setMode(e.target.value as SegmentMode)}>
              <option value="fast">Fast (~2′, μόνο drop)</option>
              <option value="club">Club (~3,5′)</option>
              <option value="full">Full (όλο το track)</option>
            </select>
          </label>
          <label>
            Fade:{" "}
            <input type="number" min={0} max={10} value={fadeSec} onChange={(e) => setFadeSec(Number(e.target.value))} /> δευτ.
          </label>
        </div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Track</th>
              <th>BPM</th>
              <th>Key</th>
              <th>Παίζει</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map(({ track, segment }, i) => {
              const f = features.get(track.id);
              const active = now?.index === i;
              return (
                <tr key={track.id} className={active ? "active" : ""}>
                  <td>{i + 1}</td>
                  <td>
                    {track.artists} — {track.name}
                    {active && <div className="muted">θέση {mmss(now!.pos)}</div>}
                  </td>
                  <td>{f?.bpm ? f.bpm.toFixed(1) : "—"}</td>
                  <td>{f?.camelot ?? "—"}</td>
                  <td>
                    {mmss(segment.startSec)} → {mmss(segment.endSec)}
                  </td>
                  <td>
                    <button className="ghost" onClick={() => setQueue((q) => q.filter((x) => x.id !== track.id))}>
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="row">
          <button disabled={!items.length} onClick={play}>
            ▶ Παίξε το set
          </button>
          <button className="ghost" onClick={stop}>
            ■ Stop
          </button>
          <span className="muted">{status}</span>
        </div>
      </div>
    </section>
  );
}
