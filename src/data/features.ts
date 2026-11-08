// Track audio data from third parties (Spotify removed audio-features for new apps).
// 1) ReccoBeats by Spotify ID (CORS ok)  2) Deezer BPM by ISRC (needs proxy: dev only for now).
import { normalizeTempo, toCamelot } from "../mix/music";
import type { Track } from "../spotify/api";

export interface Features {
  bpm: number | null; // normalized to the genre range
  rawBpm: number | null;
  camelot: string | null;
  energy: number | null; // 0..1
  source: "reccobeats" | "deezer" | "none";
}

const CACHE_KEY = "sm.features.v1";
const DEEZER_BASE = import.meta.env.DEV ? "/deezer" : null; // Phase 2: Cloudflare Worker

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

async function fromReccoBeats(ids: string[]): Promise<Map<string, Omit<Features, "source">>> {
  const out = new Map<string, Omit<Features, "source">>();
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
        bpm: normalizeTempo(f.tempo),
        camelot: typeof f.key === "number" ? toCamelot(f.key, f.mode) : null,
        energy: f.energy ?? null,
      });
    }
  }
  return out;
}

async function deezerBpm(isrc: string): Promise<number | null> {
  if (!DEEZER_BASE) return null;
  try {
    const res = await fetch(`${DEEZER_BASE}/track/isrc:${isrc}`);
    const data = await res.json();
    return data?.bpm > 0 ? data.bpm : null;
  } catch {
    return null;
  }
}

export async function getFeatures(tracks: Track[]): Promise<Map<string, Features>> {
  const cache = loadCache();
  const missing = tracks.filter((t) => !cache[t.id]);

  if (missing.length) {
    const recco = await fromReccoBeats(missing.map((t) => t.id));
    for (const t of missing) {
      const r = recco.get(t.id);
      if (r?.rawBpm) {
        cache[t.id] = { ...r, source: "reccobeats" };
        continue;
      }
      const dz = t.isrc ? await deezerBpm(t.isrc) : null;
      cache[t.id] = dz
        ? { rawBpm: dz, bpm: normalizeTempo(dz), camelot: null, energy: null, source: "deezer" }
        : { rawBpm: null, bpm: null, camelot: null, energy: null, source: "none" };
    }
    saveCache(cache);
  }

  return new Map(tracks.map((t) => [t.id, cache[t.id]]));
}
