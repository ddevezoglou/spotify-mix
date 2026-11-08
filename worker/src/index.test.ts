import { beforeEach, describe, expect, it } from "vitest";
import { handle, resetTokenMemo, type Env } from "./index";

const env: Env = { ALLOWED_ORIGINS: "http://127.0.0.1:5173", LASTFM_API_KEY: "k" };

type Tag = { name: string; count: number };
interface Fake {
  me: number;
  trackTags?: Tag[];
  artistTags?: Tag[];
  trackError6?: boolean;
  deezer?: unknown;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function fakeFetch(f: Fake): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname === "api.spotify.com" && url.pathname === "/v1/me") return json({}, f.me);
    if (url.hostname === "ws.audioscrobbler.com") {
      const method = url.searchParams.get("method");
      if (method === "track.gettoptags") {
        if (f.trackError6) return json({ error: 6, message: "Track not found" });
        return json({ toptags: { tag: f.trackTags ?? [] } });
      }
      if (method === "artist.gettoptags") return json({ toptags: { tag: f.artistTags ?? [] } });
    }
    if (url.hostname === "api.deezer.com") return json(f.deezer ?? {});
    return json({ error: "unrouted " + url.href }, 500);
  }) as typeof fetch;
}

const authed = (url: string, headers: Record<string, string> = {}) =>
  new Request(url, { headers: { Authorization: "Bearer tok", ...headers } });

describe("worker", () => {
  beforeEach(() => resetTokenMemo());

  it("401 without a valid spotify token", async () => {
    const res = await handle(new Request("https://w/tags?artist=a&track=t"), env, fakeFetch({ me: 401 }));
    expect(res.status).toBe(401);
  });

  it("401 when spotify rejects the bearer token", async () => {
    const res = await handle(authed("https://w/tags?artist=a&track=t"), env, fakeFetch({ me: 401 }));
    expect(res.status).toBe(401);
  });

  it("returns lowercased tags with count >= 10, falling back to artist tags", async () => {
    const f = fakeFetch({
      me: 200,
      trackTags: [{ name: "Deep House", count: 100 }, { name: "seen live", count: 5 }],
      artistTags: [{ name: "House", count: 100 }, { name: "electronic", count: 40 }, { name: "chill", count: 12 }],
    });
    const res = await handle(authed("https://w/tags?artist=a&track=t"), env, f);
    expect(await res.json()).toEqual({ tags: ["house", "electronic", "chill"] });
  });

  it("uses track tags when there are at least 3 qualifying", async () => {
    const f = fakeFetch({
      me: 200,
      trackTags: [{ name: " A ", count: 50 }, { name: "b", count: 20 }, { name: "c", count: 10 }],
      artistTags: [{ name: "zzz", count: 99 }],
    });
    const res = await handle(authed("https://w/tags?artist=a&track=t"), env, f);
    expect(await res.json()).toEqual({ tags: ["a", "b", "c"] });
  });

  it("caps tags at 15", async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `t${i}`, count: 50 }));
    const res = await handle(authed("https://w/tags?artist=a&track=t"), env, fakeFetch({ me: 200, trackTags: many }));
    const { tags } = (await res.json()) as { tags: string[] };
    expect(tags).toHaveLength(15);
    expect(tags[0]).toBe("t0");
  });

  it("treats last.fm error 6 as no tags", async () => {
    const f = fakeFetch({ me: 200, trackError6: true, artistTags: [] });
    const res = await handle(authed("https://w/tags?artist=a&track=t"), env, f);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tags: [] });
  });

  it("400 when artist or track is missing", async () => {
    const res = await handle(authed("https://w/tags?artist=a"), env, fakeFetch({ me: 200 }));
    expect(res.status).toBe(400);
  });

  it("adds CORS headers only for allowed origins", async () => {
    const f = () => fakeFetch({ me: 200, trackTags: [], artistTags: [] });
    const bad = await handle(authed("https://w/tags?artist=a&track=t", { Origin: "https://evil.example" }), env, f());
    expect(bad.headers.get("Access-Control-Allow-Origin")).toBeNull();
    const good = await handle(authed("https://w/tags?artist=a&track=t", { Origin: "http://127.0.0.1:5173" }), env, f());
    expect(good.headers.get("Access-Control-Allow-Origin")).toBe("http://127.0.0.1:5173");
  });

  it("answers OPTIONS with 204 and CORS headers", async () => {
    const res = await handle(
      new Request("https://w/tags", { method: "OPTIONS", headers: { Origin: "http://127.0.0.1:5173" } }),
      env,
      fakeFetch({ me: 401 }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://127.0.0.1:5173");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
  });

  it("proxies deezer GET", async () => {
    const res = await handle(authed("https://w/deezer/track/isrc:GB123"), env, fakeFetch({ me: 200, deezer: { bpm: 124 } }));
    expect(await res.json()).toEqual({ bpm: 124 });
  });

  it("rejects non-GET deezer requests", async () => {
    const req = new Request("https://w/deezer/track/1", { method: "POST", headers: { Authorization: "Bearer tok" } });
    const res = await handle(req, env, fakeFetch({ me: 200 }));
    expect(res.status).toBe(405);
  });

  it("memoizes a successful token check", async () => {
    let meCalls = 0;
    const inner = fakeFetch({ me: 200, deezer: {} });
    const counting = ((i: RequestInfo | URL, init?: RequestInit) => {
      if (String(typeof i === "string" ? i : i instanceof URL ? i.href : i.url).includes("/v1/me")) meCalls++;
      return inner(i, init);
    }) as typeof fetch;
    await handle(authed("https://w/deezer/a"), env, counting);
    await handle(authed("https://w/deezer/b"), env, counting);
    expect(meCalls).toBe(1);
  });

  it("404 for unknown routes", async () => {
    const res = await handle(authed("https://w/nope"), env, fakeFetch({ me: 200 }));
    expect(res.status).toBe(404);
  });
});
