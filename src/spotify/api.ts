// Thin Spotify Web API client. Only endpoints still available in Development Mode (Feb 2026).
import { getAccessToken } from "./auth";

const BASE = "https://api.spotify.com/v1";

export interface Track {
  id: string;
  uri: string;
  name: string;
  artists: string;
  artistIds: string[];
  durationSec: number;
  isrc: string | null;
}

export interface Playlist {
  id: string;
  name: string;
  owned: boolean;
}

export class SpotifyError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SpotifyError";
    this.status = status;
  }
}

const MAX_RETRIES = 5;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error("Δεν είσαι συνδεδεμένος.");
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(path.startsWith("http") ? path : `${BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
    });
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const secs = Number(res.headers.get("Retry-After"));
      await sleep((Number.isFinite(secs) && secs > 0 ? secs : 2) * 1000);
      continue;
    }
    if (res.status === 204) return undefined as T;
    if (!res.ok) throw new SpotifyError(res.status, `Spotify ${res.status} ${path}: ${await res.text()}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}

const toTrack = (t: any): Track => ({
  id: t.id,
  uri: t.uri,
  name: t.name,
  artists: (t.artists ?? []).map((a: { name: string }) => a.name).join(", "),
  artistIds: (t.artists ?? []).map((a: { id: string }) => a.id).filter(Boolean),
  durationSec: Math.round(t.duration_ms / 1000),
  isrc: t.external_ids?.isrc ?? null,
});

export const getMe = () => call<{ id: string; display_name: string }>("/me");

/** Search is capped at 10 results per call in Development Mode. */
export async function searchTracks(query: string): Promise<Track[]> {
  const data = await call<{ tracks: { items: unknown[] } }>(`/search?type=track&limit=10&q=${encodeURIComponent(query)}`);
  return data.tracks.items.map(toTrack);
}

export async function getMyPlaylists(myId: string): Promise<Playlist[]> {
  const out: Playlist[] = [];
  let url: string | null = "/me/playlists?limit=50";
  while (url) {
    const page: any = await call(url);
    for (const p of page.items ?? []) {
      if (p) out.push({ id: p.id, name: p.name, owned: p.owner?.id === myId || p.collaborative });
    }
    url = page.next;
  }
  return out;
}

/** Collects playable tracks from a paginated list, skipping null, local, and non-track rows. */
async function collectTracks(firstUrl: string, onProgress?: (n: number) => void): Promise<Track[]> {
  const out: Track[] = [];
  let url: string | null = firstUrl;
  while (url) {
    const page: any = await call(url);
    for (const row of page.items ?? []) {
      const t = row?.item ?? row?.track; // playlist field renamed in 2026; accept both
      if (t?.type === "track" && t.id && !t.is_local) out.push(toTrack(t));
    }
    onProgress?.(out.length);
    url = page.next;
  }
  return out;
}

/** Works only for playlists the user owns or collaborates on (Dev Mode rule). */
export const getPlaylistTracks = (playlistId: string, onProgress?: (n: number) => void) =>
  collectTracks(`/playlists/${playlistId}/items?limit=50`, onProgress);

export const getSavedTracks = (onProgress?: (n: number) => void) => collectTracks("/me/tracks?limit=50", onProgress);

const GENRE_CACHE_KEY = "sm.artistGenres.v1";

function readGenreCache(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(GENRE_CACHE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

/** Batch /artists?ids= is gone in Dev Mode, so one call per artist, cached. */
export async function getArtistGenres(artistId: string): Promise<string[]> {
  const cache = readGenreCache();
  if (cache[artistId]) return cache[artistId];
  const data = await call<{ genres?: string[] }>(`/artists/${artistId}`);
  const genres = data.genres ?? [];
  try {
    localStorage.setItem(GENRE_CACHE_KEY, JSON.stringify({ ...readGenreCache(), [artistId]: genres }));
  } catch {
    // storage unavailable or full: skip caching
  }
  return genres;
}

export async function createPlaylist(name: string, description: string): Promise<{ id: string; url: string }> {
  const p = await call<{ id: string; external_urls: { spotify: string } }>("/me/playlists", {
    method: "POST",
    body: JSON.stringify({ name, description, public: false }),
  });
  return { id: p.id, url: p.external_urls.spotify };
}

/** Adds in chunks of 100. `onChunk` gets the count added so far, so a caller can resume after a failure. */
export async function addItems(playlistId: string, uris: string[], onChunk?: (addedSoFar: number) => void): Promise<void> {
  for (let i = 0; i < uris.length; i += 100) {
    const chunk = uris.slice(i, i + 100);
    await call(`/playlists/${playlistId}/items`, { method: "POST", body: JSON.stringify({ uris: chunk }) });
    onChunk?.(i + chunk.length);
  }
}

export function playOnDevice(deviceId: string, uri: string, positionMs: number): Promise<void> {
  return call(`/me/player/play?device_id=${deviceId}`, {
    method: "PUT",
    body: JSON.stringify({ uris: [uri], position_ms: Math.max(0, Math.round(positionMs)) }),
  });
}
