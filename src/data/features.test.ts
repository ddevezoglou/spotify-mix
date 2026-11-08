// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "../spotify/api";

const workerFetch = vi.fn();
vi.mock("./worker", () => ({ workerFetch: (p: string) => workerFetch(p) }));

import { getFeatures } from "./features";

const track = (id: string): Track => ({
  id, uri: `spotify:track:${id}`, name: id, artists: "a", artistIds: ["a1"], durationSec: 200, isrc: `ISRC${id}`,
});

const json = (body: unknown) => ({ ok: true, json: async () => body }) as unknown as Response;
const row = (id: string, extra: object = {}) => ({
  href: `https://open.spotify.com/track/${id}`, tempo: 128, key: 0, mode: 1, energy: 0.8, valence: 0.6,
  danceability: 0.7, instrumentalness: 0.1, acousticness: 0.2, ...extra,
});

beforeEach(() => {
  localStorage.clear();
  workerFetch.mockReset();
  vi.unstubAllGlobals();
});

describe("getFeatures", () => {
  it("maps reccobeats fields including valence and instrumentalness", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ content: [row("t1")] })));
    const f = (await getFeatures([track("t1")])).get("t1")!;
    expect(f).toMatchObject({
      bpm: 128, rawBpm: 128, camelot: "8B", energy: 0.8, valence: 0.6, danceability: 0.7,
      instrumentalness: 0.1, acousticness: 0.2, source: "reccobeats",
    });
    expect(typeof f.fetchedAt).toBe("number");
  });

  it("falls back to deezer bpm via the worker when reccobeats misses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ content: [] })));
    workerFetch.mockResolvedValue(json({ bpm: 124 }));
    const f = (await getFeatures([track("t1")])).get("t1")!;
    expect(workerFetch).toHaveBeenCalledWith("/deezer/track/isrc:ISRCt1");
    expect(f.source).toBe("deezer");
    expect(f.bpm).toBe(124);
  });

  it("refetches 'none' entries older than 3 days but not newer ones", async () => {
    const day = 86_400_000;
    const none = (age: number) => ({
      bpm: null, rawBpm: null, camelot: null, energy: null, valence: null, danceability: null,
      instrumentalness: null, acousticness: null, source: "none", fetchedAt: Date.now() - age * day,
    });
    localStorage.setItem("sm.features.v2", JSON.stringify({ t1: none(4), t2: none(1) }));
    const fetchMock = vi.fn().mockResolvedValue(json({ content: [] }));
    vi.stubGlobal("fetch", fetchMock);
    workerFetch.mockResolvedValue(json({}));
    await getFeatures([track("t1"), track("t2")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("ids")).toBe("t1");
  });

  const cached = () => JSON.parse(localStorage.getItem("sm.features.v2") ?? "{}");
  const notOk = { ok: false, status: 503, json: async () => ({}) } as unknown as Response;

  it("does not cache a ReccoBeats batch failure as 'none' and reports it", async () => {
    for (const fetchImpl of [vi.fn().mockResolvedValue(notOk), vi.fn().mockRejectedValue(new TypeError("down"))]) {
      localStorage.clear();
      vi.stubGlobal("fetch", fetchImpl);
      workerFetch.mockResolvedValue(json({ error: { code: 800, message: "no data" } }));
      const failed: string[] = [];
      const f = (await getFeatures([track("t1")], { onFailure: (id) => failed.push(id) })).get("t1")!;
      expect(f.source).toBe("none");
      expect(failed).toEqual(["t1"]);
      expect(cached()).not.toHaveProperty("t1");
    }
  });

  it("returns a deezer-only result after a ReccoBeats failure for this run only", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(notOk));
    workerFetch.mockResolvedValue(json({ bpm: 124 }));
    const failed: string[] = [];
    const f = (await getFeatures([track("t1")], { onFailure: (id) => failed.push(id) })).get("t1")!;
    expect(f).toMatchObject({ source: "deezer", bpm: 124 });
    expect(failed).toEqual(["t1"]);
    expect(cached()).not.toHaveProperty("t1");
  });

  it("caches a genuine deezer miss (200 without bpm, or error 800) as 'none'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ content: [] })));
    for (const body of [{ bpm: 0 }, { error: { code: 800, message: "no data" } }]) {
      localStorage.clear();
      workerFetch.mockResolvedValue(json(body));
      const onFailure = vi.fn();
      const f = (await getFeatures([track("t1")], { onFailure })).get("t1")!;
      expect(f.source).toBe("none");
      expect(onFailure).not.toHaveBeenCalled();
      expect(cached().t1.source).toBe("none");
    }
  });

  it("treats other deezer errors, non-OK and worker failures as errors: reported, never cached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ content: [] })));
    const cases: (() => void)[] = [
      () => workerFetch.mockResolvedValue(json({ error: { code: 4, message: "Quota limit exceeded" } })),
      () => workerFetch.mockResolvedValue(notOk),
      () => workerFetch.mockRejectedValue(new Error("VITE_WORKER_URL is not set")),
    ];
    for (const arrange of cases) {
      localStorage.clear();
      arrange();
      const failed: string[] = [];
      const f = (await getFeatures([track("t1")], { onFailure: (id) => failed.push(id) })).get("t1")!;
      expect(f.source).toBe("none");
      expect(failed).toEqual(["t1"]);
      expect(cached()).not.toHaveProperty("t1");
    }
  });

  it("keeps a ReccoBeats row without tempo and takes the BPM from deezer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ content: [row("t1", { tempo: null })] })));
    workerFetch.mockResolvedValue(json({ bpm: 124 }));
    const f = (await getFeatures([track("t1")])).get("t1")!;
    expect(f).toMatchObject({ source: "reccobeats", bpm: 124, rawBpm: 124, energy: 0.8, valence: 0.6, camelot: "8B" });
    expect(cached().t1.source).toBe("reccobeats");
  });
});
