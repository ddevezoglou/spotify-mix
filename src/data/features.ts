// Track audio data from third parties (Spotify removed audio-features for new apps).
// 1) ReccoBeats by Spotify ID (CORS ok)  2) Deezer BPM by ISRC, through our Worker.
import { TEMPO_RANGE, normalizeTempo, toCamelot } from "../mix/music";
import type { Track } from "../spotify/api";
import { workerFetch } from "./worker";

export interface Features {
  bpm: number | null; // normalized to the genre range
  rawBpm: number | null;
  camelot: string | null;
  energy: number | null; // 0..1
  valence: number | null;
  danceability: number | null;
  instrumentalness: number | null;
  acousticness: number | null;
  source: "reccobeats" | "deezer" | "none";
  fetchedAt: number; // epoch ms
}

const CACHE_KEY = "sm.features.v2";
const NONE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

type Fields = Omit<Features, "source" | "fetchedAt">;

function loadCache(): Record<string, Features> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, Features>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* storage full or blocked: cache is only an optimisation */
  }
}

interface ReccoResult {
  rows: Map<string, Fields>;
  failed: Set<string>; // ids whose batch failed (non-OK or network error)
}

async function fromReccoBeats(ids: string[], range: [number, number]): Promise<ReccoResult> {
  const rows = new Map<string, Fields>();
  const failed = new Set<string>();
  for (let i = 0; i < ids.length; i += 20) {
    const batch = ids.slice(i, i + 20);
    let data: { content?: any[] };
    try {
      const res = await fetch(`https://api.reccobeats.com/v1/audio-features?ids=${batch.join(",")}`);
      if (!res.ok) throw new Error(`ReccoBeats ${res.status}`);
      data = await res.json();
    } catch {
      for (const id of batch) failed.add(id);
      continue;
    }
    for (const f of data.content ?? []) {
      const id = String(f.href ?? "").split("/").pop();
      if (!id) continue;
      rows.set(id, {
        rawBpm: f.tempo ?? null,
        bpm: normalizeTempo(f.tempo, range),
        camelot: typeof f.key === "number" ? toCamelot(f.key, f.mode) : null,
        energy: f.energy ?? null,
        valence: f.valence ?? null,
        danceability: f.danceability ?? null,
        instrumentalness: f.instrumentalness ?? null,
        acousticness: f.acousticness ?? null,
      });
    }
  }
  return { rows, failed };
}

const DEEZER_NO_DATA = 800;

/**
 * "miss": Deezer answered and has no BPM (HTTP 200 without bpm > 0, or error code 800 "no data").
 * "error": anything else (network, non-OK, other Deezer error such as 4 quota, worker not configured).
 */
async function deezerBpm(isrc: string): Promise<{ bpm: number } | "miss" | "error"> {
  try {
    const res = await workerFetch(`/deezer/track/isrc:${isrc}`);
    if (!res.ok) return "error";
    const data = await res.json();
    if (data?.error) return data.error.code === DEEZER_NO_DATA ? "miss" : "error";
    return data?.bpm > 0 ? { bpm: data.bpm } : "miss";
  } catch {
    return "error";
  }
}

const EMPTY: Fields = {
  bpm: null, rawBpm: null, camelot: null, energy: null,
  valence: null, danceability: null, instrumentalness: null, acousticness: null,
};

/**
 * Features per track id. Lookups that failed (as opposed to genuinely missing data) are reported
 * through `onFailure`, returned for this run only and never cached.
 * A ReccoBeats row without tempo keeps its features and takes the BPM from Deezer; its source stays
 * "reccobeats" because ReccoBeats supplied the features.
 */
export async function getFeatures(
  tracks: Track[],
  opts: { bpmRange?: [number, number]; onProgress?: (done: number) => void; onFailure?: (id: string) => void } = {},
): Promise<Map<string, Features>> {
  const range = opts.bpmRange ?? TEMPO_RANGE;
  const cache = loadCache();
  const now = Date.now();
  // Entries without BPM are "not found" results: they expire after 3 days.
  const stale = (f?: Features) => !f || (!f.rawBpm && now - f.fetchedAt > NONE_TTL_MS);
  const missing = tracks.filter((t) => stale(cache[t.id]));
  const runOnly = new Map<string, Features>();

  if (missing.length) {
    const recco = await fromReccoBeats(missing.map((t) => t.id), range);
    let done = 0;
    for (const t of missing) {
      const reccoFailed = recco.failed.has(t.id);
      const r = recco.rows.get(t.id);
      let entry: Features;
      let failed = reccoFailed;
      if (r?.rawBpm) {
        entry = { ...r, source: "reccobeats", fetchedAt: now };
      } else {
        const dz = t.isrc ? await deezerBpm(t.isrc) : "miss";
        if (dz === "error") failed = true;
        const bpm = typeof dz === "object" ? { rawBpm: dz.bpm, bpm: normalizeTempo(dz.bpm, range) } : {};
        if (r) entry = { ...r, ...bpm, source: "reccobeats", fetchedAt: now };
        else if (typeof dz === "object") entry = { ...EMPTY, ...bpm, source: "deezer", fetchedAt: now };
        else entry = { ...EMPTY, source: "none", fetchedAt: now };
      }
      if (failed) {
        runOnly.set(t.id, entry);
        opts.onFailure?.(t.id);
      } else {
        cache[t.id] = entry;
      }
      opts.onProgress?.(++done);
    }
    saveCache(cache);
  }

  return new Map(tracks.map((t) => [t.id, runOnly.get(t.id) ?? cache[t.id]]));
}
