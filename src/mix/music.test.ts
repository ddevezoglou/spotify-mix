import { describe, expect, it } from "vitest";
import { normalizeTempo, toCamelot, barSeconds, planSegment } from "./music";

describe("normalizeTempo", () => {
  it("keeps tempo already in range", () => {
    expect(normalizeTempo(128)).toBe(128);
  });
  it("doubles half-time readings", () => {
    expect(normalizeTempo(60.004)).toBeCloseTo(120.008);
  });
  it("halves double-time readings", () => {
    expect(normalizeTempo(256)).toBe(128);
  });
  it("returns null when no octave fits the range", () => {
    expect(normalizeTempo(196)).toBeNull();
  });
  it("returns null for missing tempo", () => {
    expect(normalizeTempo(0)).toBeNull();
    expect(normalizeTempo(undefined)).toBeNull();
  });
});

describe("toCamelot", () => {
  it("maps A minor to 8A and C major to 8B", () => {
    expect(toCamelot(9, 0)).toBe("8A");
    expect(toCamelot(0, 1)).toBe("8B");
  });
  it("maps G major to 9B and F minor to 4A", () => {
    expect(toCamelot(7, 1)).toBe("9B");
    expect(toCamelot(5, 0)).toBe("4A");
  });
  it("returns null for unknown key", () => {
    expect(toCamelot(-1, 1)).toBeNull();
  });
});

describe("planSegment", () => {
  const bpm = 128;
  const bar = barSeconds(bpm); // 1.875s

  it("full mode plays the whole track", () => {
    expect(planSegment({ durationSec: 400, bpm, mode: "full" })).toEqual({ startSec: 0, endSec: 400 });
  });

  it("fast mode cuts ~2 minutes aligned to 16-bar boundaries", () => {
    const s = planSegment({ durationSec: 420, bpm, mode: "fast" });
    expect((s.startSec / bar) % 16).toBeCloseTo(0);
    expect((s.endSec - s.startSec) / bar).toBe(64); // 64 bars = 2:00 at 128 BPM
    expect(s.endSec).toBeLessThanOrEqual(420);
  });

  it("drop of a long track starts around the middle", () => {
    const s = planSegment({ durationSec: 420, bpm, mode: "fast" });
    expect(s.startSec).toBeGreaterThan(420 * 0.35);
    expect(s.startSec).toBeLessThan(420 * 0.6);
  });

  it("club mode is longer than fast mode", () => {
    const fast = planSegment({ durationSec: 420, bpm, mode: "fast" });
    const club = planSegment({ durationSec: 420, bpm, mode: "club" });
    expect(club.endSec - club.startSec).toBeGreaterThan(fast.endSec - fast.startSec);
  });

  it("never runs past the end of a short track", () => {
    const s = planSegment({ durationSec: 150, bpm, mode: "club" });
    expect(s.startSec).toBeGreaterThanOrEqual(0);
    expect(s.endSec).toBeLessThanOrEqual(150);
    expect(s.endSec).toBeGreaterThan(s.startSec);
  });

  it("falls back to the whole track without bpm", () => {
    expect(planSegment({ durationSec: 300, bpm: null, mode: "fast" })).toEqual({ startSec: 0, endSec: 300 });
  });
});
