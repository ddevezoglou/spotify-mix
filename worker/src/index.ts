export interface Env {
  ALLOWED_ORIGINS: string;
  LASTFM_API_KEY: string;
}

const TOKEN_TTL_MS = 10 * 60 * 1000;
const MIN_TAG_COUNT = 10;
const MAX_TAGS = 15;
const MIN_TRACK_TAGS = 3;

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

async function tokenIsValid(token: string, fetchFn: typeof fetch): Promise<boolean> {
  const key = await sha256Hex(token);
  const exp = verified.get(key);
  if (exp !== undefined && exp > Date.now()) return true;
  const res = await fetchFn("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) return false;
  verified.set(key, Date.now() + TOKEN_TTL_MS);
  return true;
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
): Promise<string[]> {
  const url = new URL("https://ws.audioscrobbler.com/2.0/");
  url.searchParams.set("method", method);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("api_key", env.LASTFM_API_KEY);
  url.searchParams.set("autocorrect", "1");
  url.searchParams.set("format", "json");
  const res = await fetchFn(url.toString());
  if (!res.ok) return [];
  const data = (await res.json()) as LastfmTop;
  if (data.error) return []; // e.g. error 6: unknown track/artist
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
    if (tags.length < MIN_TRACK_TAGS) tags = await lastfmTags("artist.gettoptags", { artist }, env, fetchFn);
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
  if (!token || !(await tokenIsValid(token, fetchFn))) {
    return finish(Response.json({ error: "unauthorized" }, { status: 401 }));
  }

  return finish(await route(req, env, fetchFn));
}

export default {
  fetch: (req: Request, env: Env) => handle(req, env, fetch),
} satisfies ExportedHandler<Env>;
