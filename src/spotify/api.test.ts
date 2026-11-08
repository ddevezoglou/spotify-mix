// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth", () => ({ getAccessToken: async () => "t" }));

import { addItems, createPlaylist, getArtistGenres, getMe, getPlaylistTracks, getSavedTracks, SpotifyError } from "./api";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const track = (id: string) => ({
  type: "track", id, uri: `spotify:track:${id}`, name: id, duration_ms: 300000,
  artists: [{ id: "a1", name: "X" }], external_ids: { isrc: "GB123" },
});

describe("spotify api", () => {
  it("retries after 429 using Retry-After", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "Retry-After": "1" } }))
      .mockResolvedValueOnce(Response.json({ id: "me", display_name: "D" }));
    const p = getMe();
    await vi.advanceTimersByTimeAsync(1000);
    await expect(p).resolves.toMatchObject({ id: "me" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after 5 retries on 429", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () => new Response("", { status: 429, headers: { "Retry-After": "1" } }));
    const p = getMe();
    const assertion = expect(p).rejects.toMatchObject({ status: 429 });
    await vi.advanceTimersByTimeAsync(10000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("throws SpotifyError with status on non-OK", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 403 }));
    const err = await getMe().catch((e) => e);
    expect(err).toBeInstanceOf(SpotifyError);
    expect(err.status).toBe(403);
  });

  it("skips null, local and non-track items", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ next: null, items: [
      { item: null },
      { item: { type: "episode", id: "e1" } },
      { item: { type: "track", id: null, is_local: true } },
      { track: track("t1") },
    ] }));
    const tracks = await getPlaylistTracks("p");
    expect(tracks.map((t) => t.id)).toEqual(["t1"]);
    expect(tracks[0].artistIds).toEqual(["a1"]);
  });

  it("getSavedTracks paginates /me/tracks and reports progress", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ next: "https://api.spotify.com/v1/me/tracks?offset=50&limit=50", items: [{ track: track("t1") }, { track: null }] }))
      .mockResolvedValueOnce(Response.json({ next: null, items: [{ track: track("t2") }] }));
    const progress: number[] = [];
    const tracks = await getSavedTracks((n) => progress.push(n));
    expect(tracks.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(fetchMock.mock.calls[0][0]).toContain("/me/tracks?limit=50");
    expect(progress).toEqual([1, 2]);
  });

  it("getArtistGenres returns genres and caches in localStorage", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ id: "a1", genres: ["house", "techno"] }));
    await expect(getArtistGenres("a1")).resolves.toEqual(["house", "techno"]);
    await expect(getArtistGenres("a1")).resolves.toEqual(["house", "techno"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("/artists/a1");
    expect(JSON.parse(localStorage.getItem("sm.artistGenres.v1")!)).toEqual({ a1: ["house", "techno"] });
  });

  it("getArtistGenres defaults to [] when genres missing", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ id: "a2" }));
    await expect(getArtistGenres("a2")).resolves.toEqual([]);
  });

  it("adds items in chunks of 100 in order", async () => {
    fetchMock.mockImplementation(async () => Response.json({ snapshot_id: "s" }));
    const uris = Array.from({ length: 250 }, (_, i) => `spotify:track:${i}`);
    await addItems("p", uris);
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body).uris);
    expect(bodies.map((b) => b.length)).toEqual([100, 100, 50]);
    expect(bodies.flat()).toEqual(uris);
    expect(fetchMock.mock.calls[0][0]).toContain("/playlists/p/items");
  });

  it("createPlaylist posts a private playlist to /me/playlists", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ id: "np", external_urls: { spotify: "https://open.spotify.com/playlist/np" } }));
    await expect(createPlaylist("N", "D")).resolves.toEqual({ id: "np", url: "https://open.spotify.com/playlist/np" });
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/me\/playlists$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ name: "N", description: "D", public: false });
  });
});
