import { describe, expect, it } from "vitest";
import type { TrackProfile } from "../data/profile";
import { scoreTrack, selectTracks } from "./select";
import { DEFAULT_SPEC, type SetSpec } from "./spec";

const spec: SetSpec = { ...DEFAULT_SPEC, genres: ["deep house"], bpm: [120, 126], energy: 0.6, wave: 0.1, valence: 0.5, vocals: "any" };

interface Opts {
  id?: string; isrc?: string | null; hasEnoughData?: boolean; bpm?: number | null; tags?: string[];
  soundTags?: string[]; energy?: number | null; valence?: number | null; instrumentalness?: number | null;
}

// Defaults pass every gate against `spec`, so a test only fails the property it overrides.
function mk(o: Opts = {}): TrackProfile {
  const bpm = o.bpm === undefined ? 123 : o.bpm;
  const id = o.id ?? "t1";
  return {
    track: { id, uri: `spotify:track:${id}`, name: "T", artists: "A", artistIds: ["a"], durationSec: 300, isrc: o.isrc === undefined ? null : o.isrc },
    features: {
      bpm, rawBpm: bpm, camelot: "8A",
      energy: o.energy === undefined ? 0.6 : o.energy,
      valence: o.valence === undefined ? 0.5 : o.valence,
      danceability: null,
      instrumentalness: o.instrumentalness === undefined ? null : o.instrumentalness,
      acousticness: null,
      source: "none", fetchedAt: 0,
    },
    tags: o.tags ?? ["deep house"],
    soundTags: o.soundTags ?? [],
    hasEnoughData: o.hasEnoughData ?? true,
  };
}

const reasons = (p: TrackProfile, s: SetSpec = spec) => selectTracks([p], s).excluded.map((e) => e.reason);

describe("selectTracks", () => {
  it("passes a clean track", () => {
    expect(selectTracks([mk()], spec).passed).toHaveLength(1);
  });
  it("dedupes by id and by isrc", () => {
    const a = mk({ id: "1", isrc: "X" }), b = mk({ id: "1", isrc: "X" }), c = mk({ id: "2", isrc: "X" });
    const s = selectTracks([a, b, c], spec);
    expect(s.passed).toHaveLength(1);
    expect(s.excluded.map((e) => e.reason)).toEqual(["duplicate", "duplicate"]);
  });
  it("excludes a track that matches mood and genre but not sound", () => {
    const p = mk({ tags: ["deep house"], energy: 0.6, valence: 0.5, instrumentalness: 0.05 });
    expect(selectTracks([p], { ...spec, vocals: "none" }).excluded[0].reason).toBe("sound");
  });
  it("excludes tracks without enough data with reason no-data", () => {
    expect(reasons(mk({ hasEnoughData: false }))).toEqual(["no-data"]);
  });
  it("excludes bpm out of range before mood", () => {
    expect(reasons(mk({ bpm: 140, energy: 0, valence: 1 }))).toEqual(["bpm"]);
  });
  it("excludes on mood, then genre", () => {
    expect(reasons(mk({ energy: 0.1, valence: 0.9 }))).toEqual(["mood"]);
    expect(reasons(mk({ tags: ["jazz"] }))).toEqual(["genre"]);
  });
  it("some-vocals rejects low instrumentalness only without a vocal tag", () => {
    const s = { ...spec, vocals: "some" as const };
    expect(reasons(mk({ instrumentalness: 0.1 }), s)).toEqual(["sound"]);
    expect(reasons(mk({ instrumentalness: 0.1, soundTags: ["vocal"] }), s)).toEqual([]);
  });
  it("sorts passed by total descending", () => {
    const hi = mk({ id: "hi" }), lo = mk({ id: "lo", energy: 0.75, valence: 0.7 });
    expect(selectTracks([lo, hi], spec).passed.map((x) => x.profile.track.id)).toEqual(["hi", "lo"]);
  });
});

describe("scoreTrack", () => {
  it("accepts same-family genre at 0.6", () => {
    expect(scoreTrack(mk({ tags: ["tech house"] }), { ...spec, genres: ["deep house"] }).genre).toBe(0.6);
  });
  it("scores exact genre match at 1", () => {
    expect(scoreTrack(mk(), spec).genre).toBe(1);
  });
  it("energy inside the wave band scores full mood", () => {
    expect(scoreTrack(mk({ energy: 0.68, valence: 0.5 }), { ...spec, energy: 0.6, wave: 0.1 }).mood).toBe(1);
  });
  it("missing features: both missing fails mood, one missing counts 0.3", () => {
    expect(scoreTrack(mk({ energy: null, valence: null }), spec).mood).toBeCloseTo(0.4);
    expect(scoreTrack(mk({ energy: null, valence: 0.5 }), spec).mood).toBeCloseTo(0.85);
  });
  it("sound words map to 0.5 + 0.5 * share", () => {
    const s = { ...spec, soundTags: ["dark", "deep"] };
    expect(scoreTrack(mk({ soundTags: ["dark"] }), s).sound).toBeCloseTo(0.75);
    expect(scoreTrack(mk({ soundTags: ["bright"] }), s).sound).toBe(0);
  });
});
