# Backlog: Engine v1

This lists the items the reviews found and left for later, plus the decisions taken during the build. Source: the per-task reviews and the final whole-branch review (2026-11-08).

## Decisions taken while building (and what each costs if wrong)
| Decision | Why | Cost if wrong |
|---|---|---|
| Free AI = Cloudflare Workers AI, not Gemini | Gemini's free tier is not allowed for apps serving EEA users | — |
| Player: Spotify Connect primary, Web Playback SDK fallback | With Connect, music keeps playing if the tab dies | Background timers are riskier, so check in Phase 2 |
| The Worker accepts any valid Spotify user (no allowlist) | By design: anyone with their own Client ID may use the app | A third party could use up the Last.fm quota until per-user rate limits land (Phase 3) |
| Failed lookups (features, tags, genres) are never cached, only genuine "not found" (expires after 3 days) | Coverage must not be distorted | A few extra calls |
| Mood gate: mean ≥ 0.5 **and** each term ≤ 0.6 (`MAX_MOOD_TERM`) | Spec anti-goal: no vibe-breaking track | Fewer tracks pass. Tune the constants in `src/mix/select.ts` |
| Energy and valence both missing → excluded as "no-data" | Fewer tracks is better than an intruder | Smaller sets for playlists with sparse data |
| Coverage go = enough ≥ 80% **and** failed = 0. "Usable" % is also shown | An honest Phase 0 measurement | — |
| Saved sets keep only spec, order and cuts (`sm.sets.v2`) | Full profiles filled localStorage | Old `sm.sets.v1` entries are not read |
| Removed scopes `playlist-modify-public` and `user-top-read` | Least privilege | Phase 3 may need to add `user-top-read` back |
| Removed the Spotify artist-genres lookup (2026-11-09) | On the 531-track House playlist it returned 0 genres for 276 artists and failed for 48, blocking the coverage verdict. Genre now comes only from Last.fm tags | None while Spotify keeps the field empty |

## Open items (can wait)
### Selection and ordering (tune after real sets)
- Genre is the max over all tags, including artist-level fallback tags. One artist-level "house" tag can let a techno track into a deep-house set at 0.6. Consider weighting track-level tags first.
- Tag checks are case-sensitive in places. Upstream lowercases everything, so the risk is low.
- 2-opt recomputes the full path cost per candidate (O(n³) per pass). It is bounded by the 2 s cap, but blocks the main thread. Use deltas or a Web Worker if sets grow.
- `bpmCost` has no guard for tolerance ≤ 0.02 or a BPM of 0.
- Tests lack threshold-boundary cases (0.5 mood, 0.6 genre), a mood-before-genre ordering test, an energy-wave-following test, and a start-track rule test.
- The I2 refill re-runs ordering each round, which can take a few seconds on long sets.

### Data
- Cached `bpm` is normalised to the range of that run. Phase 4 (more genres) should normalise `rawBpm` at read time.
- The first artist comes from `track.artists.split(", ")`, which breaks for artist names that contain ", ".
- Deezer lookups run sequentially, which is slow on big playlists.
- `onProgress` for features counts only tracks that were fetched.
- Spotify `Retry-After` wait has no upper cap.
- Last.fm load: consider caching tags in the Worker (Cache API) or running lookups 2 at a time instead of 4.
- On a Last.fm artist-fallback failure, `/tags` returns 503 even if the track-level call succeeded.

### Worker
- The token memo map is never pruned.
- `Vary: Origin` is set only for allowed origins.
- No tests for memo TTL expiry or Deezer query-string forwarding.

### UI
- Result table has no styling.
- Number inputs can't be cleared while typing. Genre family headings show raw English keys. Radio group names are fixed.
- The «Δοκίμασε ξανά» button also shows on the Saved 403 error, where retrying can't help.
- The Setup input lacks an `aria-label`. `set/clearClientId` don't guard against localStorage throwing. «Αλλαγή Client ID» appears to do nothing when the `VITE_SPOTIFY_CLIENT_ID` dev default is set.

### Spec gaps for later plans
- Manually including no-data tracks (spec §5.4).
- A "check spec" screen (spec §6.3), which belongs with free text in Phase 3.
- GitHub Actions: `configure-pages@v5` and `upload-artifact` still target Node 20. Bump the versions when newer majors ship.
