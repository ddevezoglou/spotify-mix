// Spotify Authorization Code + PKCE. Runs fully in the browser: no client secret, no server.

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
const SCOPES = [
  "streaming", // Web Playback SDK
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "playlist-modify-public",
  "user-top-read",
  "user-library-read",
].join(" ");

const TOKEN_KEY = "sm.token";
const VERIFIER_KEY = "sm.verifier";

interface StoredToken {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch ms
}

export const redirectUri = () => `${location.origin}${import.meta.env.BASE_URL}`;
export const hasClientId = () => Boolean(CLIENT_ID);

function randomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function login(): Promise<void> {
  if (!CLIENT_ID) throw new Error("Λείπει το VITE_SPOTIFY_CLIENT_ID στο .env.local");
  const verifier = randomString(64);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(),
    code_challenge_method: "S256",
    code_challenge: await challengeFor(verifier),
    scope: SCOPES,
  });
  location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

async function requestToken(body: Record<string, string>): Promise<StoredToken> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID!, ...body }),
  });
  if (!res.ok) throw new Error(`Spotify token error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const previous = readToken();
  const token: StoredToken = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? previous?.refresh_token ?? "",
    expires_at: Date.now() + data.expires_in * 1000,
  };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  return token;
}

function readToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as StoredToken) : null;
  } catch {
    return null;
  }
}

/** Call once on page load: finishes the redirect from Spotify if a ?code is present. */
export async function handleRedirect(): Promise<void> {
  const url = new URL(location.href);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  if (!code && !error) return;
  history.replaceState(null, "", redirectUri()); // strip ?code from the address bar
  if (error) throw new Error(`Spotify login: ${error}`);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error("Λείπει ο PKCE verifier. Δοκίμασε ξανά login.");
  sessionStorage.removeItem(VERIFIER_KEY);
  await requestToken({ grant_type: "authorization_code", code: code!, redirect_uri: redirectUri(), code_verifier: verifier });
}

let refreshing: Promise<StoredToken> | null = null;

/** Valid access token, refreshed when it is about to expire. Null when logged out. */
export async function getAccessToken(): Promise<string | null> {
  const token = readToken();
  if (!token) return null;
  if (Date.now() < token.expires_at - 60_000) return token.access_token;
  if (!token.refresh_token) return null;
  refreshing ??= requestToken({ grant_type: "refresh_token", refresh_token: token.refresh_token }).finally(() => {
    refreshing = null;
  });
  return (await refreshing).access_token;
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
}
