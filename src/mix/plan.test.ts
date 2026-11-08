import { describe, expect, it } from "vitest";
import type { TrackProfile } from "../data/profile";
import { computeCoverage, planSet } from "./plan";
import { DEFAULT_SPEC, type SetSpec } from "./spec";

const spec: SetSpec = { ...DEFAULT_SPEC, genres: ["deep house"], bpm: [118, 135], energy: 0.6, wave: 0.1, valence: 0.5, vocals: "any", durationMin: 30, cutStyle: "fast" };

function mk(id: string, o: { bpm?: number | null; tags?: string[]; hasEnoughData?: boolean; camelot?: string; energy?: number | null; valence?: number | null } = {}): TrackProfile {
  const bpm = o.bpm === undefined ? 128 : o.bpm;
  return {
    track: { id, uri: `spotify:track:${id}`, name: id, artists: "A", artistIds: ["a"], durationSec: 360, isrc: null },
    features: {
      bpm, rawBpm: bpm, camelot: o.camelot ?? "8A", energy: o.energy === undefined ? 0.6 : o.energy,
      valence: o.valence === undefined ? 0.5 : o.valence, danceability: null,
      instrumentalness: null, acousticness: null, source: "none", fetchedAt: 0,
    },
    tags: o.tags ?? ["deep house"], soundTags: [], hasEnoughData: o.hasEnoughData ?? true,
  };
}

describe("planSet", () => {
  it("reports shortfall instead of padding", () => {
    const plan = planSet([mk("a"), mk("b"), mk("c", { tags: ["jazz"] })], { ...spec, durationMin: 60 });
    expect(plan.items).toHaveLength(2);
    expect(plan.shortfallMin).toBeGreaterThan(0);
    expect(plan.totalSec).toBeCloseTo(240, 5);
  });
  it("stops adding tracks once the duration is reached", () => {
    const profiles = Array.from({ length: 40 }, (_, i) => mk(`t${i}`));
    const plan = planSet(profiles, spec);
    expect(plan.items).toHaveLength(15); // 15 x 120 s = 30 min
    expect(plan.shortfallMin).toBe(0);
  });
  it("full style never cuts", () => {
    const profiles = Array.from({ length: 6 }, (_, i) => mk(`t${i}`));
    const plan = planSet(profiles, { ...spec, cutStyle: "full", durationMin: 30 });
    for (const it of plan.items) expect(it.segment).toEqual({ startSec: 0, endSec: 360 });
  });
  it("marks a high-cost neighbour as bridge with a fast segment", () => {
    const plan = planSet([mk("a", { bpm: 124 }), mk("b", { bpm: 132 })], { ...spec, cutStyle: "club" });
    expect(plan.items.map((i) => i.role)).toEqual(["bridge", "bridge"]);
    for (const it of plan.items) {
      expect(it.segment.endSec - it.segment.startSec).toBeCloseTo(64 * (240 / it.profile.features.bpm!), 5);
    }
  });
  it("adds more passed tracks when bridge cuts leave the set short", () => {
    // Alternating BPM groups (124 vs 132 is beyond the 6% tolerance) with incompatible keys.
    // The first fill (9 tracks at the club estimate) covers 30 min, but bridge cuts shorten it.
    const profiles = Array.from({ length: 20 }, (_, i) =>
      mk(`t${i}`, i % 2 === 0 ? { bpm: 124, camelot: "8A" } : { bpm: 132, camelot: "2B" }),
    );
    const plan = planSet(profiles, { ...spec, cutStyle: "club", durationMin: 30 });
    expect(plan.items.some((i) => i.role === "bridge")).toBe(true);
    expect(plan.items.length).toBeGreaterThan(9);
    expect(plan.shortfallMin).toBe(0);
    expect(plan.totalSec).toBeGreaterThanOrEqual(30 * 60);
  });
  it("keeps compatible neighbours as main with the spec cut", () => {
    const plan = planSet([mk("a", { bpm: 124 }), mk("b", { bpm: 124 })], { ...spec, cutStyle: "club" });
    expect(plan.items.map((i) => i.role)).toEqual(["main", "main"]);
  });
});

describe("computeCoverage", () => {
  it("go is true at 80% and false below", () => {
    const mkSet = (enough: number) =>
      Array.from({ length: 5 }, (_, i) => mk(`c${i}`, { hasEnoughData: i < enough }));
    expect(computeCoverage(mkSet(4))).toMatchObject({ total: 5, enough: 4, enoughPct: 80, go: true });
    expect(computeCoverage(mkSet(3))).toMatchObject({ enoughPct: 60, go: false });
  });
  it("counts bpm and genre signals and handles empty input", () => {
    const c = computeCoverage([mk("a", { bpm: null, tags: [] }), mk("b")]);
    expect(c).toMatchObject({ withBpm: 1, withGenre: 1 });
    expect(computeCoverage([])).toMatchObject({ enoughPct: 0, go: false });
  });
  it("counts usable profiles: enough data and energy or valence present", () => {
    const c = computeCoverage([
      mk("a"),
      mk("b", { energy: null }),
      mk("c", { energy: null, valence: null }),
      mk("d", { hasEnoughData: false }),
    ]);
    expect(c).toMatchObject({ total: 4, enough: 3, enoughPct: 75, usable: 2, usablePct: 50 });
    expect(computeCoverage([])).toMatchObject({ usable: 0, usablePct: 0 });
  });
  it("counts each track id once", () => {
    const c = computeCoverage([mk("a"), mk("a"), mk("b", { hasEnoughData: false })]);
    expect(c).toMatchObject({ total: 2, enough: 1, enoughPct: 50 });
  });
  it("go is false when any lookup failed, even at 100%", () => {
    const all = Array.from({ length: 5 }, (_, i) => mk(`c${i}`));
    expect(computeCoverage(all, 2)).toMatchObject({ enoughPct: 100, failed: 2, go: false });
    expect(computeCoverage(all)).toMatchObject({ failed: 0, go: true });
    expect(planSet(all, spec, undefined, 1).coverage).toMatchObject({ failed: 1, go: false });
  });
});
