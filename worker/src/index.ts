export interface Env {
  ALLOWED_ORIGINS: string;
  LASTFM_API_KEY: string;
}

const TOKEN_TTL_MS = 10 * 60 * 1000;
const MIN_TAG_COUNT = 10;
const MAX_TAGS = 15;
const MIN_TRACK_TAGS = 3;
const LASTFM_NOT_FOUND = 6;

// Per-isolate memo of verified tokens: SHA-256(token) -> expiry timestamp.
const verified = new Map<string, number>();

/** Test helper: clears the per-isolate token memo. */
export function resetTokenMemo(): void {
  verified.clear();
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type TokenCheck = "valid" | "invalid" | "unavailable";

async function checkToken(token: string, fetchFn: typeof fetch): Promise<TokenCheck> {
  const key = await sha256Hex(token);
  const exp = verified.get(key);
  if (exp !== undefined && exp > Date.now()) return "valid";
  let res: Response;
  try {
    res = await fetchFn("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return "unavailable";
  }
  // Spotify rate limiting or outage says nothing about the token: never memoize it as a verdict.
  if (res.status === 429 || res.status >= 500) return "unavailable";
  if (res.status !== 200) return "invalid";
  verified.set(key, Date.now() + TOKEN_TTL_MS);
  return "valid";
}

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get("Origin");
  const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

interface LastfmTop {
  error?: number;
  toptags?: { tag?: { name: string; count: number | string }[] };
}

async function lastfmTags(
  method: "track.gettoptags" | "artist.gettoptags",
  params: Record<string, string>,
  env: Env,
  fetchFn: typeof fetch,
): Promise<string[] | null> {
  const url = new URL("https://ws.audioscrobbler.com/2.0/");
  url.searchParams.set("method", method);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("api_key", env.LASTFM_API_KEY);
  url.searchParams.set("autocorrect", "1");
  url.searchParams.set("format", "json");
  const res = await fetchFn(url.toString());
  if (!res.ok) return null;
  const data = (await res.json()) as LastfmTop;
  if (data.error === LASTFM_NOT_FOUND) return [];
  if (data.error) return null; // e.g. 29 rate limit, 11/16 service trouble: a failure, not "no tags"
  return (data.toptags?.tag ?? [])
    .filter((t) => Number(t.count) >= MIN_TAG_COUNT)
    .map((t) => t.name.trim().toLowerCase())
    .filter(Boolean);
}

async function route(req: Request, env: Env, fetchFn: typeof fetch): Promise<Response> {
  const url = new URL(req.url);

  if (url.pathname === "/tags") {
    const artist = url.searchParams.get("artist");
    const track = url.searchParams.get("track");
    if (!artist || !track) return Response.json({ error: "artist and track are required" }, { status: 400 });
    let tags = await lastfmTags("track.gettoptags", { artist, track }, env, fetchFn);
    if (tags !== null && tags.length < MIN_TRACK_TAGS) tags = await lastfmTags("artist.gettoptags", { artist }, env, fetchFn);
    if (tags === null) return Response.json({ error: "last.fm unavailable" }, { status: 503 });
    return Response.json({ tags: tags.slice(0, MAX_TAGS) });
  }

  if (url.pathname.startsWith("/deezer/")) {
    if (req.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
    const upstream = await fetchFn(`https://api.deezer.com/${url.pathname.slice("/deezer/".length)}${url.search}`);
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
    });
  }

  return new Response("Not Found", { status: 404 });
}

export async function handle(req: Request, env: Env, fetchFn: typeof fetch): Promise<Response> {
  const cors = corsHeaders(req, env);
  const finish = (res: Response): Response => {
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  };

  if (req.method === "OPTIONS") return finish(new Response(null, { status: 204 }));

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const check = token ? await checkToken(token, fetchFn) : "invalid";
  if (check === "unavailable") return finish(Response.json({ error: "spotify unavailable" }, { status: 503 }));
  if (check === "invalid") return finish(Response.json({ error: "unauthorized" }, { status: 401 }));

  try {
    return finish(await route(req, env, fetchFn));
  } catch {
    return finish(Response.json({ error: "upstream error" }, { status: 502 }));
  }
}

export default {
  fetch: (req: Request, env: Env) => handle(req, env, fetch),
} satisfies ExportedHandler<Env>;
