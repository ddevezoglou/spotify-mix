// Combines audio features with genre/sound tags into one profile per track.
import { genreVocabulary } from "../mix/genres";
import { getArtistGenres, type Track } from "../spotify/api";
import { getFeatures, type Features } from "./features";
import { workerFetch } from "./worker";

export interface TrackProfile {
  track: Track;
  features: Features;
  tags: string[]; // normalized: Last.fm tags + Spotify artist genres, lowercased, deduped
  soundTags: string[]; // tags + deriveSoundTags(features)
  hasEnoughData: boolean; // features.bpm !== null && genre signal present
}

const CACHE_KEY = "sm.tags.v1";
const EMPTY_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const CONCURRENCY = 4;

interface CachedTags {
  tags: string[];
  fetchedAt: number;
}

function loadCache(): Record<string, CachedTags> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, CachedTags>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* storage full or blocked: cache is only an optimisation */
  }
}

export function deriveSoundTags(f: Features): string[] {
  const out: string[] = [];
  if (f.valence !== null) {
    if (f.valence < 0.35) out.push("dark");
    else if (f.valence > 0.65) out.push("bright");
  }
  if (f.energy !== null) {
    if (f.energy > 0.75) out.push("energetic");
    else if (f.energy < 0.45) out.push("chill");
  }
  if (f.instrumentalness !== null) out.push(f.instrumentalness >= 0.5 ? "instrumental" : "vocal");
  if (f.acousticness !== null && f.acousticness > 0.5) out.push("acoustic");
  return out;
}

const norm = (tags: string[]) => tags.map((t) => t.trim().toLowerCase()).filter(Boolean);

// A trailing " - X" or "(X)"/"[X]" that only names the version: Original/Extended/Radio/Club Mix|Edit|Version,
// or Remaster(ed) with an optional year or text. Remix names such as "(Someone Remix)" do not match.
const MIX_SUFFIX =
  /(?:\s+-\s*|\s*[([]\s*)(?:(?:original|extended|radio|club)\s+(?:mix|edit|version)|(?:\d{4}\s+)?remaster(?:ed)?\b[^()[\]]*?)\s*[)\]]?\s*$/i;

/** Title for the Last.fm lookup: strips version suffixes ("- Original Mix", "(Extended Mix)", "- Remastered 2011"). */
export function lookupTitle(name: string): string {
  let out = name;
  for (let prev = ""; prev !== out; ) {
    prev = out;
    out = out.replace(MIX_SUFFIX, "");
  }
  return out.trim() || name;
}

/** Returns tags, or null when the lookup failed (never cached). */
async function fetchTags(track: Track): Promise<string[] | null> {
  const artist = track.artists.split(", ")[0];
  try {
    const res = await workerFetch(`/tags?artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(lookupTitle(track.name))}`);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.tags) ? norm(data.tags.map(String)) : null;
  } catch {
    return null;
  }
}

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const run = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}

/** Lookups that failed (network, quota, upstream error) in this run, as opposed to genuinely missing data. */
export interface FailedLookups {
  features: number; // tracks
  tags: number; // tracks
  genres: number; // artists
}

export async function buildProfiles(
  tracks: Track[],
  opts: { bpmRange: [number, number]; onProgress?: (stage: string, done: number, total: number) => void },
): Promise<{ profiles: TrackProfile[]; failed: FailedLookups }> {
  const { onProgress } = opts;
  const failedFeatures = new Set<string>();
  const features = await getFeatures(tracks, {
    bpmRange: opts.bpmRange,
    onProgress: onProgress ? (d: number) => onProgress("features", d, tracks.length) : undefined,
    onFailure: (id) => failedFeatures.add(id),
  });

  // Last.fm tags, cached by track id.
  const cache = loadCache();
  const tagsById = new Map<string, string[]>();
  const todo: Track[] = [];
  const failedTags = new Set<string>();
  const now = Date.now();
  for (const t of tracks) {
    const c = cache[t.id];
    if (c && (c.tags.length > 0 || now - c.fetchedAt < EMPTY_TTL_MS)) tagsById.set(t.id, c.tags);
    else todo.push(t);
  }
  let done = tracks.length - todo.length;
  onProgress?.("tags", done, tracks.length);
  await pool(todo, CONCURRENCY, async (t) => {
    const tags = await fetchTags(t);
    if (tags === null) {
      tagsById.set(t.id, []); // this run only
      failedTags.add(t.id);
    } else {
      tagsById.set(t.id, tags);
      cache[t.id] = { tags, fetchedAt: Date.now() };
    }
    onProgress?.("tags", ++done, tracks.length);
  });
  saveCache(cache);

  // Spotify artist genres: once per unique first artist.
  const artistIds = [...new Set(tracks.map((t) => t.artistIds[0]).filter((id): id is string => !!id))];
  const genresByArtist = new Map<string, string[]>();
  let failedGenres = 0;
  let gDone = 0;
  onProgress?.("genres", 0, artistIds.length);
  await pool(artistIds, CONCURRENCY, async (id) => {
    try {
      genresByArtist.set(id, norm(await getArtistGenres(id)));
    } catch {
      genresByArtist.set(id, []);
      failedGenres++;
    }
    onProgress?.("genres", ++gDone, artistIds.length);
  });

  const vocab = new Set(genreVocabulary());
  const profiles = tracks.map((track) => {
    const f = features.get(track.id) as Features;
    const lastfm = tagsById.get(track.id) ?? [];
    const genres = genresByArtist.get(track.artistIds[0]) ?? [];
    const tags = [...new Set([...lastfm, ...genres])];
    const soundTags = [...new Set([...tags, ...deriveSoundTags(f)])];
    const genreSignal = tags.some((t) => vocab.has(t)) || genres.length > 0;
    return { track, features: f, tags, soundTags, hasEnoughData: f.bpm !== null && genreSignal };
  });
  return { profiles, failed: { features: failedFeatures.size, tags: failedTags.size, genres: failedGenres } };
}
