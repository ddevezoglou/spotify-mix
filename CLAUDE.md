# CLAUDE.md: spotify-mix

A "DJ for Spotify". The user describes a mood. The app builds a set of any length (for example a 6-hour party) and keeps that mood steady and spot on.

The user writes in Greek. Answer in Greek: simple, short and complete.

## Read first
- **Design (the authority):** `docs/superpowers/specs/2026-11-08-spotify-mix-design.md`
- **What has been built:** `docs/superpowers/plans/2026-11-08-engine-v1.md`
- **Open items and decisions taken:** `docs/BACKLOG.md`
- **Setup and commands:** `README.md`

## Product rules (do not break)
- Priority order: **track selection** first (it must match mood + genre + sound, all three), then **order**, then **cuts**. A cut means playing only the useful part of a track.
- **Never two tracks at once.** No overlap or blends: Spotify policy forbids it and the user does not want it.
- **Never modify the user's playlists or library.** The output is always a **new** private playlist.
- Never pad a set with tracks that do not match. If there are not enough, report the shortfall.
- No API keys and no cost for end users. Every user brings their own Spotify Client ID, using the in-app guide.
- No unofficial or private Spotify APIs.

## Current state (2026-11-08)
- **Engine v1 is done.** The flow is: playlist or Saved → form → selection → order → cuts → new Spotify playlist, plus a data-coverage report. 116 tests pass.
- **Live site:** https://ddevezoglou.github.io/spotify-mix/ (GitHub Pages, deployed from `main` by `.github/workflows/pages.yml`).
- **Worker:** https://spotify-mix-worker.ddevezoglou.workers.dev (Cloudflare). It holds the `LASTFM_API_KEY` secret, `ALLOWED_ORIGINS` is set in `worker/wrangler.toml`, and the repo variable `WORKER_URL` points to it.
- **Pending: the Phase 0 coverage number.** It comes from the user's 526-track "House" playlist. Go = enough ≥ 80% **and** failed lookups = 0. Record the result in the README.

## Next
1. If coverage is no-go, raise it first, for example with in-browser analysis of Deezer 30-second previews (spec §5.3.4, after checking their terms).
2. **Phase 2 plan:** the set player with cuts. Spotify Connect is the primary device (the music keeps playing if the tab dies) and the Web Playback SDK is the fallback. It needs a background-timing check, user cue corrections, and LRCLIB chorus detection.
3. **Phase 3 plan:** free-text prompts through Cloudflare Workers AI (Gemini's free tier is not allowed for EEA users), a "whole Spotify" source, and per-user rate limits in the Worker.

## Dev
- `npm test` · `npm run typecheck` (checks app and worker) · `npm run dev` (http://127.0.0.1:5173/) · `npm run worker:dev` (needs `worker/.dev.vars`) · `npm run worker:deploy`
- `.env.local` needs `VITE_WORKER_URL`. `VITE_SPOTIFY_CLIENT_ID` is an optional dev default.
- Mix logic lives in `src/mix/` (pure functions with tests). Data sources live in `src/data/`, Spotify calls in `src/spotify/`, screens in `src/components/`.
- Spotify Dev Mode (2026): use `/playlists/{id}/items`, `POST /me/playlists`, search limit 10, and no batch `/artists`.
