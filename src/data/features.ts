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

async function fromReccoBeats(ids: string[], range: [number, number]): Promise<Map<string, Fields>> {
  const out = new Map<string, Fields>();
  for (let i = 0; i < ids.length; i += 20) {
    const batch = ids.slice(i, i + 20);
    const res = await fetch(`https://api.reccobeats.com/v1/audio-features?ids=${batch.join(",")}`);
    if (!res.ok) continue;
    const data = await res.json();
    for (const f of data.content ?? []) {
      const id = String(f.href ?? "").split("/").pop();
      if (!id) continue;
      out.set(id, {
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
  return out;
}

async function deezerBpm(isrc: string): Promise<number | null> {
  try {
    const res = await workerFetch(`/deezer/track/isrc:${isrc}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.bpm > 0 ? data.bpm : null;
  } catch {
    return null;
  }
}

const EMPTY: Fields = {
  bpm: null, rawBpm: null, camelot: null, energy: null,
  valence: null, danceability: null, instrumentalness: null, acousticness: null,
};

export async function getFeatures(
  tracks: Track[],
  opts: { bpmRange?: [number, number]; onProgress?: (done: number) => void } = {},
): Promise<Map<string, Features>> {
  const range = opts.bpmRange ?? TEMPO_RANGE;
  const cache = loadCache();
  const now = Date.now();
  const stale = (f?: Features) => !f || (f.source === "none" && now - f.fetchedAt > NONE_TTL_MS);
  const missing = tracks.filter((t) => stale(cache[t.id]));

  if (missing.length) {
    const recco = await fromReccoBeats(missing.map((t) => t.id), range);
    let done = 0;
    for (const t of missing) {
      const r = recco.get(t.id);
      if (r?.rawBpm) {
        cache[t.id] = { ...r, source: "reccobeats", fetchedAt: now };
      } else {
        const dz = t.isrc ? await deezerBpm(t.isrc) : null;
        cache[t.id] = dz
          ? { ...EMPTY, rawBpm: dz, bpm: normalizeTempo(dz, range), source: "deezer", fetchedAt: now }
          : { ...EMPTY, source: "none", fetchedAt: now };
      }
      opts.onProgress?.(++done);
    }
    saveCache(cache);
  }

  return new Map(tracks.map((t) => [t.id, cache[t.id]]));
}
