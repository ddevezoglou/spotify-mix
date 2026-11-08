// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "../spotify/api";
import type { Features } from "./features";

const getArtistGenres = vi.fn();
const getFeatures = vi.fn();
const workerFetch = vi.fn();
vi.mock("../spotify/api", () => ({ getArtistGenres: (id: string) => getArtistGenres(id) }));
vi.mock("./features", () => ({ getFeatures: (...a: unknown[]) => getFeatures(...a) }));
vi.mock("./worker", () => ({ workerFetch: (p: string) => workerFetch(p) }));

import { buildProfiles, deriveSoundTags, lookupTitle } from "./profile";

const feat = (o: Partial<Features> = {}): Features => ({
  bpm: 124, rawBpm: 124, camelot: "8A", energy: 0.6, valence: 0.5, danceability: 0.7,
  instrumentalness: null, acousticness: null, source: "reccobeats", fetchedAt: 0, ...o,
});
const NULLS = { energy: null, valence: null, danceability: null, instrumentalness: null, acousticness: null };
const track = (id: string, artistId = "a1"): Track => ({
  id, uri: `spotify:track:${id}`, name: `n ${id}`, artists: "First, Second", artistIds: [artistId, "x"], durationSec: 200, isrc: null,
});
const tagsRes = (tags: string[]) => ({ ok: true, json: async () => ({ tags }) }) as unknown as Response;
const opts = { bpmRange: [110, 150] as [number, number] };

beforeEach(() => {
  localStorage.clear();
  getArtistGenres.mockReset().mockResolvedValue([]);
  getFeatures.mockReset();
  workerFetch.mockReset();
});

describe("deriveSoundTags", () => {
  it("applies each rule", () => {
    expect(deriveSoundTags(feat({ ...NULLS, valence: 0.2 }))).toEqual(["dark"]);
    expect(deriveSoundTags(feat({ ...NULLS, valence: 0.8 }))).toEqual(["bright"]);
    expect(deriveSoundTags(feat({ ...NULLS, energy: 0.9 }))).toEqual(["energetic"]);
    expect(deriveSoundTags(feat({ ...NULLS, energy: 0.3 }))).toEqual(["chill"]);
    expect(deriveSoundTags(feat({ ...NULLS, instrumentalness: 0.5 }))).toEqual(["instrumental"]);
    expect(deriveSoundTags(feat({ ...NULLS, instrumentalness: 0.1 }))).toEqual(["vocal"]);
    expect(deriveSoundTags(feat({ ...NULLS, acousticness: 0.6 }))).toEqual(["acoustic"]);
  });
  it("returns [] for all-null and mid values", () => {
    expect(deriveSoundTags(feat(NULLS))).toEqual([]);
    expect(deriveSoundTags(feat({ ...NULLS, valence: 0.5, energy: 0.6, acousticness: 0.5 }))).toEqual([]);
  });
});

describe("lookupTitle", () => {
  it("strips version suffixes, case-insensitive", () => {
    expect(lookupTitle("Strings of Life - Original Mix")).toBe("Strings of Life");
    expect(lookupTitle("Finally (Extended Mix)")).toBe("Finally");
    expect(lookupTitle("Show Me Love - radio edit")).toBe("Show Me Love");
    expect(lookupTitle("Gypsy Woman (Club Mix)")).toBe("Gypsy Woman");
    expect(lookupTitle("Blue Monday - Remastered 2015")).toBe("Blue Monday");
    expect(lookupTitle("Your Love - 2011 Remaster")).toBe("Your Love");
    expect(lookupTitle("Big Fun [Remastered]")).toBe("Big Fun");
    expect(lookupTitle("Pacific State - Radio Edit (Remastered)")).toBe("Pacific State");
  });
  it("keeps remix names and plain titles", () => {
    expect(lookupTitle("Cola (Purple Disco Machine Remix)")).toBe("Cola (Purple Disco Machine Remix)");
    expect(lookupTitle("Sing It Back - Boris Musical Mix")).toBe("Sing It Back - Boris Musical Mix");
    expect(lookupTitle("Original Mix")).toBe("Original Mix");
    expect(lookupTitle("Mix-Up")).toBe("Mix-Up");
  });
});

describe("buildProfiles", () => {
  const setup = (f: Features, tags: string[], genres: string[] = []) => {
    getFeatures.mockResolvedValue(new Map([["t1", f]]));
    workerFetch.mockResolvedValue(tagsRes(tags));
    getArtistGenres.mockResolvedValue(genres);
  };

  it("has enough data with BPM and a vocabulary tag; tags are normalized", async () => {
    setup(feat(), ["Deep House"]);
    const { profiles: [p] } = await buildProfiles([track("t1")], opts);
    expect(p.hasEnoughData).toBe(true);
    expect(p.tags).toEqual(["deep house"]);
    expect(p.soundTags).toContain("deep house");
    expect(workerFetch).toHaveBeenCalledWith("/tags?artist=First&track=n%20t1");
  });

  it("is false with BPM but no tags or genres", async () => {
    setup(feat(), []);
    expect((await buildProfiles([track("t1")], opts)).profiles[0].hasEnoughData).toBe(false);
  });

  it("is false with tags but no BPM", async () => {
    setup(feat({ bpm: null }), ["deep house"]);
    expect((await buildProfiles([track("t1")], opts)).profiles[0].hasEnoughData).toBe(false);
  });

  it("counts any Spotify artist genre as signal and merges deduped", async () => {
    setup(feat(), ["indietronica"], ["Indietronica", "Weird Genre"]);
    const { profiles: [p] } = await buildProfiles([track("t1")], opts);
    expect(p.hasEnoughData).toBe(true);
    expect(p.tags).toEqual(["indietronica", "weird genre"]);
  });

  it("does not cache failed lookups (throw or non-OK)", async () => {
    setup(feat(), []);
    workerFetch.mockRejectedValueOnce(new Error("down"));
    expect((await buildProfiles([track("t1")], opts)).profiles[0].tags).toEqual([]);
    expect(localStorage.getItem("sm.tags.v1") ?? "{}").not.toContain("t1");
    workerFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) } as unknown as Response);
    await buildProfiles([track("t1")], opts);
    expect(localStorage.getItem("sm.tags.v1") ?? "{}").not.toContain("t1");
    await buildProfiles([track("t1")], opts);
    expect(workerFetch).toHaveBeenCalledTimes(3);
  });

  it("caches genuine empty results for 3 days, then refetches", async () => {
    setup(feat(), []);
    await buildProfiles([track("t1")], opts);
    await buildProfiles([track("t1")], opts);
    expect(workerFetch).toHaveBeenCalledTimes(1);
    const cache = JSON.parse(localStorage.getItem("sm.tags.v1")!);
    cache.t1.fetchedAt = Date.now() - 4 * 24 * 60 * 60 * 1000;
    localStorage.setItem("sm.tags.v1", JSON.stringify(cache));
    await buildProfiles([track("t1")], opts);
    expect(workerFetch).toHaveBeenCalledTimes(2);
  });

  it("caches non-empty tags and skips the worker next time", async () => {
    setup(feat(), ["techno"]);
    await buildProfiles([track("t1")], opts);
    const { profiles: [p] } = await buildProfiles([track("t1")], opts);
    expect(workerFetch).toHaveBeenCalledTimes(1);
    expect(p.tags).toEqual(["techno"]);
  });

  it("looks up artist genres once per unique first artist", async () => {
    getFeatures.mockResolvedValue(new Map([["t1", feat()], ["t2", feat()], ["t3", feat()]]));
    workerFetch.mockResolvedValue(tagsRes([]));
    await buildProfiles([track("t1", "a1"), track("t2", "a1"), track("t3", "a2")], opts);
    expect(getArtistGenres).toHaveBeenCalledTimes(2);
  });

  it("looks up Last.fm with the cleaned title", async () => {
    setup(feat(), ["techno"]);
    await buildProfiles([{ ...track("t1"), name: "Spastik - Original Mix" }], opts);
    expect(workerFetch).toHaveBeenCalledWith("/tags?artist=First&track=Spastik");
  });

  it("counts failed feature, tag and genre lookups", async () => {
    getFeatures.mockImplementation(async (_t: Track[], o: { onFailure?: (id: string) => void }) => {
      o.onFailure?.("t2");
      return new Map([["t1", feat()], ["t2", feat()]]);
    });
    workerFetch.mockResolvedValueOnce(tagsRes(["techno"])).mockRejectedValueOnce(new Error("down"));
    getArtistGenres.mockImplementation(async (id: string) => {
      if (id === "a2") throw new Error("429");
      return [];
    });
    const { failed } = await buildProfiles([track("t1", "a1"), track("t2", "a2")], opts);
    expect(failed).toEqual({ features: 1, tags: 1, genres: 1 });
  });

  it("reports no failures when every lookup answers", async () => {
    setup(feat(), []);
    expect((await buildProfiles([track("t1")], opts)).failed).toEqual({ features: 0, tags: 0, genres: 0 });
  });
});
