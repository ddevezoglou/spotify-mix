import { describe, expect, it } from "vitest";
import { DEFAULT_SPEC, validateSpec, type SetSpec } from "./spec";
import { genreFamily, genreVocabulary } from "./genres";

const bad = (p: Partial<SetSpec>) => validateSpec({ ...DEFAULT_SPEC, ...p });

describe("validateSpec", () => {
  it("accepts the default spec", () => expect(validateSpec(DEFAULT_SPEC)).toEqual([]));
  it("rejects empty genres", () => expect(bad({ genres: [] }).length).toBeGreaterThan(0));
  it("rejects bpm outside range", () => {
    expect(bad({ bpm: [90, 120] }).length).toBeGreaterThan(0);
    expect(bad({ bpm: [120, 160] }).length).toBeGreaterThan(0);
  });
  it("rejects min > max bpm", () => expect(bad({ bpm: [130, 120] }).length).toBeGreaterThan(0));
  it("rejects energy/valence outside 0..1", () => {
    expect(bad({ energy: 1.1 }).length).toBeGreaterThan(0);
    expect(bad({ valence: -0.1 }).length).toBeGreaterThan(0);
  });
  it("rejects wave outside 0..0.3", () => expect(bad({ wave: 0.4 }).length).toBeGreaterThan(0));
  it("rejects duration outside 30..720", () => {
    expect(bad({ durationMin: 10 }).length).toBeGreaterThan(0);
    expect(bad({ durationMin: 800 }).length).toBeGreaterThan(0);
  });
});

describe("genres", () => {
  it("maps tags to families", () => {
    expect(genreFamily("melodic techno")).toBe("techno");
    expect(genreFamily("polka")).toBeNull();
  });
  it("vocabulary contains all member tags", () => {
    const v = genreVocabulary();
    expect(v).toContain("deep house");
    expect(v).toContain("edm");
  });
});
