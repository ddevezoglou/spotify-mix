// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackProfile } from "./profile";
import { DEFAULT_SPEC } from "../mix/spec";
import type { SetPlan } from "../mix/plan";
import { listSets, loadSet, saveSet } from "./sets";

const profile = (id: string): TrackProfile => ({
  track: { id, uri: `spotify:track:${id}`, name: `N ${id}`, artists: "A, B", artistIds: ["a"], durationSec: 300, isrc: "X" },
  features: {
    bpm: 124, rawBpm: 124, camelot: "8A", energy: 0.7, valence: 0.5, danceability: 0.8,
    instrumentalness: 0.3, acousticness: 0.1, source: "reccobeats", fetchedAt: 1,
  },
  tags: ["deep house"],
  soundTags: ["deep house", "vocal"],
  hasEnoughData: true,
});

const COVERAGE = { total: 3, withBpm: 3, withGenre: 3, enough: 3, enoughPct: 100, usable: 3, usablePct: 100, failed: 0, go: true };

const plan = (name: string): SetPlan =>
  ({
    spec: { ...DEFAULT_SPEC, name },
    items: [{ profile: profile("t1"), segment: { startSec: 10, endSec: 130 }, role: "bridge" }],
    totalSec: 120,
    shortfallMin: 2,
    selection: {
      passed: [],
      excluded: [
        { profile: profile("t2"), reason: "mood" },
        { profile: profile("t3"), reason: "mood" },
        { profile: profile("t4"), reason: "duplicate" },
      ],
    },
    coverage: COVERAGE,
  }) as SetPlan;

describe("sets", () => {
  beforeEach(() => localStorage.clear());

  it("saves a compact set and lists and loads it", () => {
    const id = saveSet(plan("A"), "https://open.spotify.com/playlist/x")!;
    const list = listSets();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id, name: "A" });
    expect(typeof list[0].createdAt).toBe("number");
    const s = loadSet(id)!;
    expect(s).toMatchObject({
      id,
      spec: { name: "A" },
      totalSec: 120,
      shortfallMin: 2,
      coverage: COVERAGE,
      playlistUrl: "https://open.spotify.com/playlist/x",
      excludedCounts: { "no-data": 0, bpm: 0, mood: 2, genre: 0, sound: 0, duplicate: 1 },
    });
    expect(s.items).toEqual([
      {
        id: "t1", uri: "spotify:track:t1", name: "N t1", artists: "A, B", bpm: 124, camelot: "8A", energy: 0.7,
        segment: { startSec: 10, endSec: 130 }, role: "bridge",
      },
    ]);
    const raw = localStorage.getItem("sm.sets.v2")!;
    expect(raw).not.toContain("hasEnoughData");
    expect(raw).not.toContain("danceability");
    expect(raw).not.toContain("selection");
    expect(loadSet("missing")).toBeNull();
  });

  it("keeps at most 20 sets, dropping the oldest", () => {
    const ids = Array.from({ length: 21 }, (_, i) => saveSet(plan(`S${i}`)));
    const list = listSets();
    expect(list).toHaveLength(20);
    expect(loadSet(ids[0]!)).toBeNull();
    expect(loadSet(ids[20]!)?.spec.name).toBe("S20");
  });

  it("returns null instead of throwing when storage fails", () => {
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    try {
      expect(saveSet(plan("A"))).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});
