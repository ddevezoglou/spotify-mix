// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SPEC } from "../mix/spec";
import type { SetPlan } from "../mix/plan";
import { listSets, loadSet, saveSet } from "./sets";

const plan = (name: string): SetPlan =>
  ({
    spec: { ...DEFAULT_SPEC, name },
    items: [],
    totalSec: 0,
    shortfallMin: 0,
    selection: { passed: [], excluded: [] },
    coverage: { total: 0, withBpm: 0, withGenre: 0, enough: 0, enoughPct: 0, failed: 0, go: false },
  }) as SetPlan;

describe("sets", () => {
  beforeEach(() => localStorage.clear());

  it("saves, lists and loads a set", () => {
    const id = saveSet(plan("A"), "https://open.spotify.com/playlist/x");
    const list = listSets();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id, name: "A" });
    expect(typeof list[0].createdAt).toBe("number");
    expect(loadSet(id)?.spec.name).toBe("A");
    expect(loadSet("missing")).toBeNull();
  });

  it("keeps at most 20 sets, dropping the oldest", () => {
    const ids = Array.from({ length: 21 }, (_, i) => saveSet(plan(`S${i}`)));
    const list = listSets();
    expect(list).toHaveLength(20);
    expect(loadSet(ids[0])).toBeNull();
    expect(loadSet(ids[20])?.spec.name).toBe("S20");
  });

  it("does not throw when storage fails", () => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("quota");
    };
    try {
      expect(() => saveSet(plan("A"))).not.toThrow();
    } finally {
      Storage.prototype.setItem = orig;
    }
  });
});
