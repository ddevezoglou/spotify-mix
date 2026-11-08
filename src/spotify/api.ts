// Thin Spotify Web API client. Only endpoints still available in Development Mode (Feb 2026).
import { getAccessToken } from "./auth";

const BASE = "https://api.spotify.com/v1";

export interface Track {
  id: string;
  uri: string;
  name: string;
  artists: string;
  durationSec: number;
  isrc: string | null;
}

export interface Playlist {
  id: string;
  name: string;
  owned: boolean;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error("Δεν είσαι συνδεδεμένος.");
  const res = await fetch(path.startsWith("http") ? path : `${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) throw new Error(`Spotify ${res.status} ${path}: ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const toTrack = (t: any): Track => ({
  id: t.id,
  uri: t.uri,
  name: t.name,
  artists: (t.artists ?? []).map((a: { name: string }) => a.name).join(", "),
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

/** Works only for playlists the user owns or collaborates on (Dev Mode rule). */
export async function getPlaylistTracks(playlistId: string): Promise<Track[]> {
  const out: Track[] = [];
  let url: string | null = `/playlists/${playlistId}/items?limit=50`;
  while (url) {
    const page: any = await call(url);
    for (const row of page.items ?? []) {
      const t = row.item ?? row.track; // field renamed in 2026; accept both
      if (t?.type === "track" && t.id) out.push(toTrack(t));
    }
    url = page.next;
  }
  return out;
}

export function playOnDevice(deviceId: string, uri: string, positionMs: number): Promise<void> {
  return call(`/me/player/play?device_id=${deviceId}`, {
    method: "PUT",
    body: JSON.stringify({ uris: [uri], position_ms: Math.max(0, Math.round(positionMs)) }),
  });
}
