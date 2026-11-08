import { describe, expect, it } from "vitest";
import type { TrackProfile } from "../data/profile";
import { bpmCost, camelotDistance, energyTarget, orderTracks, pathCost, transitionCost } from "./order";
import { DEFAULT_SPEC, type SetSpec } from "./spec";

const spec: SetSpec = { ...DEFAULT_SPEC, energy: 0.6, wave: 0.1 };

function mk(id: string, bpm: number | null, camelot: string | null = "8A", energy: number | null = 0.6): TrackProfile {
  return {
    track: { id, uri: `spotify:track:${id}`, name: id, artists: "A", artistIds: ["a"], durationSec: 300, isrc: null },
    features: {
      bpm, rawBpm: bpm, camelot, energy, valence: 0.5, danceability: null,
      instrumentalness: null, acousticness: null, source: "none", fetchedAt: 0,
    },
    tags: [], soundTags: [], hasEnoughData: true,
  };
}

// Mulberry32: small deterministic PRNG.
function prng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("camelotDistance", () => {
  it("scores key relations", () => {
    expect(camelotDistance("8A", "8A")).toBe(0);
    expect(camelotDistance("8A", "9A")).toBe(0.3);
    expect(camelotDistance("12A", "1A")).toBe(0.3);
    expect(camelotDistance("8A", "8B")).toBe(0.3);
    expect(camelotDistance("8A", "3B")).toBe(1);
    expect(camelotDistance(null, "8A")).toBe(0.5);
    expect(camelotDistance("8A", null)).toBe(0.5);
  });
});

describe("bpmCost", () => {
  it("is free within 2%, linear to tolerance, 3 beyond", () => {
    expect(bpmCost(124, 124, 0.06)).toBe(0);
    expect(bpmCost(120, 140, 0.06)).toBe(3);
    expect(bpmCost(100, 104, 0.06)).toBeCloseTo(0.5, 5);
  });
});

describe("energyTarget / transitionCost", () => {
  it("follows the sine wave", () => {
    expect(energyTarget(0, spec)).toBeCloseTo(0.6, 5);
    expect(energyTarget(2, spec)).toBeCloseTo(0.7, 5);
  });
  it("treats null BPM as cost 1 for the BPM part", () => {
    expect(transitionCost(mk("a", null), mk("b", 124))).toBe(1);
  });
});

describe("orderTracks", () => {
  it("returns empty and single inputs as is", () => {
    expect(orderTracks([], spec)).toEqual([]);
    const one = [mk("a", 124)];
    expect(orderTracks(one, spec)).toEqual(one);
  });

  it("orders shuffled BPMs ascending", () => {
    const items = [120, 126, 122, 124].map((b) => mk(`t${b}`, b));
    expect(orderTracks(items, { ...spec, wave: 0 }).map((p) => p.features.bpm)).toEqual([120, 122, 124, 126]);
  });

  it("handles 150 random profiles quickly without worsening the path", () => {
    const r = prng(42);
    const keys = ["8A", "9A", "8B", "3B", "12A", "1A", null];
    const items = Array.from({ length: 150 }, (_, i) =>
      mk(`t${i}`, 118 + r() * 14, keys[Math.floor(r() * keys.length)], r()),
    );
    const t0 = performance.now();
    const out = orderTracks(items, spec);
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(out).toHaveLength(150);
    expect(new Set(out.map((p) => p.track.id)).size).toBe(150);
    expect(pathCost(out, spec)).toBeLessThanOrEqual(pathCost(items, spec));
  });
});
