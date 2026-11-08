import { getAccessToken } from "../spotify/auth";

/** Fetch from our Cloudflare Worker, authenticated with the user's Spotify token. */
export async function workerFetch(path: string): Promise<Response> {
  const base = import.meta.env.VITE_WORKER_URL as string | undefined;
  if (!base) throw new Error("VITE_WORKER_URL is not set");
  const token = await getAccessToken();
  if (!token) throw new Error("Δεν είσαι συνδεδεμένος.");
  return fetch(`${base.replace(/\/$/, "")}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
