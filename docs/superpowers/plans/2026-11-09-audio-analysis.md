# Audio analysis (Deezer previews → sound fingerprint, mood, BPM, key): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every track that has a Deezer preview gets, from its own audio, a sound fingerprint (embedding), mood scores, Discogs styles, BPM and key. Selection and ordering use them to keep a set inside one "sound neighbourhood". Coverage on the House playlist rises from 28% to ≥ 80%.

**Architecture:** The browser downloads the 30″ Deezer MP3 and decodes it with Web Audio. A Web Worker runs essentia.js (BPM, key, mel-spectrogram) and onnxruntime-web (Essentia Discogs-EffNet + heads). Results are reduced to numbers in pure, unit-tested functions and cached in IndexedDB. Audio is never stored. The mix logic in `src/mix/` gains calibration, accuracy, merge and similarity helpers, all pure.

**Tech Stack:** React 19, TypeScript, Vite, Vitest (+ happy-dom, + `fake-indexeddb` for the cache tests), `essentia.js@0.1.3` (AGPL-3.0), `onnxruntime-web@1.31.1` (MIT), Essentia models (CC BY-NC-SA 4.0), Deezer API through the existing Worker.

**Spec:** `docs/superpowers/specs/2026-11-09-audio-analysis-design.md` (extends `docs/superpowers/specs/2026-11-08-spotify-mix-design.md`)

## Global Constraints

- **Never store audio.** The MP3 bytes and decoded PCM live only in memory during one track's analysis. Only numbers go into IndexedDB.
- Failed lookups (network, non-OK, Deezer quota) are **never cached** and count as failures. A genuine "not found" (no ISRC on Deezer, no `preview`, undecodable audio) is cached as a miss for **3 days**.
- Coverage go = **≥ 80%** of source tracks with BPM **and** (fingerprint **or** genre signal), **and** 0 failed lookups.
- Source priority: BPM and key from ReccoBeats, else analysis. Energy, valence and vocals from analysis, else ReccoBeats. Fingerprint only from analysis.
- Accuracy targets on tracks with both sources: BPM agreement (≤ 2% after `normalizeTempo`) target **≥ 90%**. If key agreement (same or Camelot neighbour, `camelotDistance` ≤ 0.3) is **< 60%**, analysis keys are not used. If an energy/valence linear fit has **r < 0.5**, use the raw model proxy instead.
- Never two tracks at once. Never modify the user's playlists. Never pad a set.
- UI copy in Greek. Attribution must show: «Μοντέλα: MTG Essentia (CC BY-NC-SA 4.0) · Δείγματα ήχου: Deezer».
- Analysis runs in a Web Worker. The page must stay responsive.
- Model files are served from our own origin (`${import.meta.env.BASE_URL}models/…`), because essentia.upf.edu sends no CORS headers. They are downloaded by `npm run models` (dev and CI) and are not committed.

## Review Focus

1. **Track without ISRC, or Deezer has no preview**: expect a miss (cached 3 days), not a failure. The track still uses ReccoBeats data. Test: Task 4 `treats missing isrc and missing preview as a miss`.
2. **Deezer quota or network error mid-run**: expect a failure count, no cache entry, and a later run that retries only those. Test: Task 4 `does not cache failures and retries them next run`.
3. **User presses Cancel during analysis**: expect finished tracks to stay cached and the run to stop with no set built. Test: Task 4 `stops on abort and keeps finished results`.
4. **IndexedDB unavailable (private window, blocked storage)**: expect analysis to still run, uncached. Test: Task 4 `works without indexeddb`.
5. **Reference tracks that have no fingerprint**: expect them ignored. If none has one, fall back to the medoid mode. Test: Task 7 `ignores reference tracks without embedding`.

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/fetch-models.mjs` (new) | Downloads model files into `public/models/` |
| `src/data/deezer.ts` (new) | `deezerTrack(isrc)` → bpm + preview URL, through the Worker |
| `src/data/features.ts` (modify) | Uses `deezerTrack` instead of its private `deezerBpm` |
| `src/analysis/types.ts` (new) | `AudioAnalysis`, `RawAnalysis`, `ANALYSIS_VERSION`, head config |
| `src/analysis/summarize.ts` (new) | Pure: `RawAnalysis` → `AudioAnalysis` |
| `src/analysis/engine.ts` (new) | Worker-side: essentia.js + onnxruntime-web → `RawAnalysis` |
| `src/analysis/worker.ts` (new) | Web Worker message handler around `engine.ts` |
| `src/analysis/client.ts` (new) | Main thread: decode MP3, call the worker, summarize |
| `src/analysis/cache.ts` (new) | IndexedDB read/write of results |
| `src/analysis/run.ts` (new) | `analyzeTracks`: cache → Deezer → download → analyze, concurrency, abort |
| `src/mix/similarity.ts` (new) | `cosine`, `centroid`, `medoid` |
| `src/mix/calibrate.ts` (new) | Energy/valence proxies, linear fit, `calibrate` |
| `src/mix/accuracy.ts` (new) | `measureAccuracy` |
| `src/mix/merge.ts` (new) | `mergeAnalysis`, `analysisTags` |
| `src/data/profile.ts` (modify) | Runs analysis, merges, returns accuracy |
| `src/mix/plan.ts`, `select.ts`, `order.ts`, `spec.ts` (modify) | Coverage, sound gate, order term, `refTrackIds` |
| `src/components/RefPicker.tsx` (new), `NewSet.tsx`, `Result.tsx`, `App.tsx` (modify) | UI |
| `spike.html`, `src/spike/main.ts` (temporary, Tasks 1–3) | Measurement page, deleted in Task 9 |

---

### Task 1: Spike: does in-browser analysis work, fast enough and accurately?

Throwaway measurement. No tests. **Go/no-go gate for the whole plan.**

**Files:**
- Create: `scripts/fetch-models.mjs`, `spike.html`, `src/spike/main.ts`
- Modify: `package.json` (deps + `"models"` script), `.gitignore` (`public/models/`), `vite.config.ts` (`build.rollupOptions.input` = `index.html` + `spike.html`), `.github/workflows/pages.yml` (`- run: npm run models` before `npm run build`)

**Interfaces:**
- Produces: `npm run models`, which writes to `public/models/`:
  - `discogs-effnet-bsdynamic-1.onnx` and `.json`, from `https://essentia.upf.edu/models/feature-extractors/discogs-effnet/`
  - for each head in `mood_happy`, `mood_sad`, `mood_aggressive`, `mood_relaxed`, `mood_party`, `danceability`, `voice_instrumental`, `genre_electronic`: `<head>-discogs-effnet-1.onnx` and `.json`, from `https://essentia.upf.edu/models/classification-heads/<head>/`

  The script skips files that already exist and exits non-zero on any failed download.
- Produces: the **Spike findings** section at the end of this plan, filled in.

- [ ] **Step 1:** `npm i essentia.js@0.1.3 onnxruntime-web@1.31.1`. Write `scripts/fetch-models.mjs`, add `"models": "node scripts/fetch-models.mjs"`, gitignore `public/models/`, and add the CI step. Run `npm run models`. Expected: 18 files in `public/models/`, the effnet file ~18 MB.
- [ ] **Step 2:** Write `spike.html` + `src/spike/main.ts`, and add `spike.html` to the Vite build inputs. Flow:
  - read the token from `localStorage["sm.token"]` (same origin as the app);
  - load the playlist named "House" (same paging as `collectTracks`);
  - take 20 tracks whose `sm.features.v2` entry has `source: "reccobeats"` and a `rawBpm`;
  - for each: `GET ${VITE_WORKER_URL}/deezer/track/isrc:{isrc}` with the bearer token (inline; `deezerTrack` comes in Task 2) → fetch the `preview` → `decodeAudioData` → mono at the native rate and at 16 kHz (`OfflineAudioContext`) → in a module Web Worker:
    - essentia.js `RhythmExtractor2013` → BPM;
    - `KeyExtractor` (profile `edma`) → key + scale;
    - mel bands as `TensorflowInputMusiCNN` (16 kHz) → patches of 128 frames × 96 bands (hop 62) → effnet ONNX → per-patch predictions `[n,400]` and embeddings `[n,1280]`;
    - each head ONNX on the per-patch embeddings, averaged.
  - Print a table (title, BPM ReccoBeats vs analysis, Camelot both, top-3 Discogs styles, ms per track) and the cosine-similarity stats in Step 3. Also `console.log` one JSON summary.
- [ ] **Step 3:** In the page, compute the cosines between mean-pooled, L2-normalized embeddings. Pairs come from the tracks' cached Last.fm tags (`sm.tags.v1`): **same-family** pairs (both only house-family tags, or both only techno-family tags) versus **cross-family** pairs (one each). Print the median of each.
- [ ] **Step 4:** Commit, push (the page deploys to `https://ddevezoglou.github.io/spotify-mix/spike.html`), and ask the user to open it while logged in and send the JSON summary.
- [ ] **Step 5:** Fill in **Spike findings** below:
  - exact ONNX input/output names for effnet and for the heads;
  - the mel parameters actually used, and how essentia.js was imported in the worker;
  - `ort.env.wasm.wasmPaths`;
  - ms per track;
  - BPM agreement %, key agreement %;
  - the median cosine same-family and cross-family;
  - **`SIM_MIN` = midpoint of those two medians**, rounded to 2 decimals.

  **Gate:** go only if analysis runs in the browser, takes ≤ 3000 ms per track, and BPM agreement is ≥ 90%. On no-go, stop and report to the user with the numbers. Do not start Task 2.
- [ ] **Step 6:** Commit: `chore: audio analysis spike and model fetch script`.

### Task 2: Deezer lookup, analysis types and summarize

**Files:**
- Create: `src/data/deezer.ts`, `src/analysis/types.ts`, `src/analysis/summarize.ts`, `src/analysis/summarize.test.ts`, `src/data/deezer.test.ts`
- Modify: `src/data/features.ts` (replace `deezerBpm` with `deezerTrack`; behaviour unchanged, existing tests must stay green)

**Interfaces:**
- Produces (`src/data/deezer.ts`):
  ```ts
  export interface DeezerTrack { bpm: number | null; preview: string | null } // bpm 0 → null, "" preview → null
  export async function deezerTrack(isrc: string): Promise<DeezerTrack | "miss" | "error">; // 800 → "miss"; non-OK/throw/other error → "error"
  ```
- Produces (`src/analysis/types.ts`):
  ```ts
  export const ANALYSIS_VERSION = 1;
  export type HeadName = "happy" | "sad" | "aggressive" | "relaxed" | "party" | "danceable" | "voice";
  export const HEADS: Record<HeadName, { file: string; positive: number }>; // positive = class index from the model .json
  //   happy: mood_happy idx 0 · sad: mood_sad idx 1 · aggressive: mood_aggressive idx 0 · relaxed: mood_relaxed idx 1
  //   party: mood_party idx 1 · danceable: danceability idx 0 · voice: voice_instrumental idx 1
  export const ELECTRONIC_CLASSES = ["ambient", "dnb", "house", "techno", "trance"] as const;
  export interface RawAnalysis {
    rawBpm: number | null; key: string | null; scale: "major" | "minor" | null;
    embeddings: Float32Array; patches: number;          // patches × 1280, row-major
    styles: Float32Array;                               // 400, mean over patches
    heads: Record<HeadName, number[]>;                  // per-class probs, mean over patches
    electronic: number[];                               // 5, order of ELECTRONIC_CLASSES
  }
  export interface AudioAnalysis {
    version: number; rawBpm: number | null; camelot: string | null;
    moods: Record<HeadName, number>;                    // positive-class prob 0..1
    electronic: Record<(typeof ELECTRONIC_CLASSES)[number], number>;
    styles: [string, number][];                         // top 5 by prob, label as in effnet .json ("Electronic---Deep House")
    embedding: Float32Array;                            // 1280, mean-pooled, L2-normalized
    fetchedAt: number;
  }
  ```
- Produces (`src/analysis/summarize.ts`): `export function summarize(raw: RawAnalysis, styleLabels: string[], now: number): AudioAnalysis` and `export function keyToCamelot(key: string | null, scale: "major" | "minor" | null): string | null` (accepts sharps and flats; built on `toCamelot` from `src/mix/music.ts`).

- [ ] **Step 1: Failing tests** in `summarize.test.ts`:
  - `mean-pools and L2-normalizes embeddings`: 2 patches `[3,0,…]`, `[0,4,…]` (1280 dims) → embedding `[0.6, 0.8, 0, …]`.
  - `picks the positive class per head`: `heads.sad = [0.2, 0.8]` → `moods.sad === 0.8`; `heads.happy = [0.7, 0.3]` → `moods.happy === 0.7`.
  - `returns the top 5 styles with labels`.
  - `keyToCamelot("A","minor") === "8A"`, `keyToCamelot("Eb","major") === keyToCamelot("D#","major")`, `keyToCamelot(null, null) === null`.

  In `deezer.test.ts` (mock `./worker` as `features.test.ts` does):
  - `maps bpm 0 to null and keeps preview`;
  - `code 800 is a miss`;
  - `quota error code 4 is an error`;
  - `non-OK is an error`.
- [ ] **Step 2:** `npx vitest run src/analysis src/data/deezer.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement the three files. Switch `features.ts` to `deezerTrack` (bpm `null` → `"miss"` path as today).
- [ ] **Step 4:** `npm test` and `npm run typecheck`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat: deezer track lookup and analysis summary`.

### Task 3: Analysis engine in a Web Worker

Browser-only code, not unit-tested. Verified by re-running the spike page on the production engine.

**Files:**
- Create: `src/analysis/engine.ts`, `src/analysis/worker.ts`, `src/analysis/client.ts`
- Modify: `src/spike/main.ts` (use `analyzeAudio` from `client.ts` instead of its own pipeline)

**Interfaces:**
- Consumes: `RawAnalysis`, `HEADS`, `summarize` (Task 2); the Spike findings (names, mel parameters, wasm paths).
- Produces (`client.ts`): `export async function analyzeAudio(mp3: ArrayBuffer): Promise<AudioAnalysis | "miss">`. A decode failure or a clip shorter than 5 s → `"miss"`. A worker or model load error → throws.
- Produces (`engine.ts`): `export async function analyzePcm(native: Float32Array, nativeRate: number, pcm16k: Float32Array): Promise<RawAnalysis>`. Models load once per worker and are reused.

- [ ] **Step 1:** Implement the three files from the spike's working pipeline. One module worker (`new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })`), created lazily and reused. Requests are serialized through the worker. Transfer buffers with `postMessage(…, [buffer])`.
- [ ] **Step 2:** `npm run build`. Expected: success, and the worker chunk is emitted.
- [ ] **Step 3:** Push, and ask the user to re-open `spike.html`. Expected: the same BPM/key agreement as in the findings (±1 track) and ms per track within +20% of the spike.
- [ ] **Step 4:** Commit: `feat: in-browser audio analysis worker`.

### Task 4: Cache and orchestration

**Files:**
- Create: `src/analysis/cache.ts`, `src/analysis/run.ts`, `src/analysis/run.test.ts`, `src/analysis/cache.test.ts`
- Modify: `package.json` (devDependency `fake-indexeddb`)

**Interfaces:**
- Consumes: `deezerTrack` (Task 2), `analyzeAudio` (Task 3), `ANALYSIS_VERSION`.
- Produces (`cache.ts`), DB `sm-analysis`, store `results`, key = track id:
  ```ts
  export async function readAnalyses(ids: string[], now: number): Promise<Map<string, AudioAnalysis | "miss">>;
  // drops entries with another version, and misses older than 3 days; returns an empty map if IndexedDB throws
  export async function writeAnalysis(id: string, r: AudioAnalysis | "miss", now: number): Promise<void>; // swallows errors
  ```
- Produces (`run.ts`):
  ```ts
  export interface AnalyzeDeps {
    lookup(isrc: string): Promise<DeezerTrack | "miss" | "error">;
    download(url: string, signal?: AbortSignal): Promise<ArrayBuffer>;   // throws on non-OK
    analyze(mp3: ArrayBuffer): Promise<AudioAnalysis | "miss">;
    read: typeof readAnalyses; write: typeof writeAnalysis; now(): number;
  }
  export async function analyzeTracks(
    tracks: Track[],
    opts?: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void; deps?: Partial<AnalyzeDeps> },
  ): Promise<{ results: Map<string, AudioAnalysis>; failed: number }>;
  // concurrency 3; on abort rejects with DOMException "AbortError" after in-flight tracks settle
  ```

- [ ] **Step 1: Failing tests.** `cache.test.ts` (`import "fake-indexeddb/auto"`):
  - `round-trips an analysis including the Float32Array embedding`;
  - `drops other versions`;
  - `expires misses after 3 days`.

  `run.test.ts` (all deps injected):
  - `uses cached results without lookup`;
  - `treats missing isrc and missing preview as a miss` (written as `"miss"`, not in `results`, `failed` 0);
  - `does not cache failures and retries them next run` (lookup `"error"`, then download throws → `failed` 2, nothing written; the second run calls lookup again);
  - `stops on abort and keeps finished results` (abort after the 2nd of 5 → rejects `AbortError`, at least 2 written);
  - `works without indexeddb` (read rejects → treated as empty; write rejects → ignored; results still returned);
  - `reports progress for every track including cached ones`.
- [ ] **Step 2:** `npx vitest run src/analysis`. Expected: FAIL.
- [ ] **Step 3:** Implement. The default deps are `deezerTrack`, `fetch(url, { signal })`, `analyzeAudio`, the cache functions and `Date.now`.
- [ ] **Step 4:** `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: analysis cache and orchestration`.

### Task 5: Calibration, accuracy and merge (pure)

**Files:**
- Create: `src/mix/similarity.ts`, `src/mix/calibrate.ts`, `src/mix/accuracy.ts`, `src/mix/merge.ts`, plus a `.test.ts` for each

**Interfaces:**
- Produces (`similarity.ts`):
  - `cosine(a: Float32Array, b: Float32Array): number`
  - `centroid(vs: Float32Array[]): Float32Array` (mean, L2-normalized)
  - `medoid(vs: Float32Array[]): number` (index with the highest mean cosine to the others; 0 for length 1)
- Produces (`calibrate.ts`):
  ```ts
  export interface Fit { a: number; b: number; r: number }                 // y = a·x + b, Pearson r
  export function linearFit(xs: number[], ys: number[]): Fit | null;      // null when n < 10 or zero variance
  export function energyProxy(m: AudioAnalysis["moods"]): number;          // (aggressive + party + (1 − relaxed)) / 3
  export function valenceProxy(m: AudioAnalysis["moods"]): number;         // (happy + (1 − sad)) / 2
  export interface Calibration { energy: Fit | null; valence: Fit | null } // null → use the raw proxy
  export function calibrate(pairs: { features: Features; analysis: AudioAnalysis }[]): Calibration; // a fit with r < 0.5 becomes null
  ```
- Produces (`accuracy.ts`):
  ```ts
  export interface Accuracy { n: number; bpmAgreePct: number | null; keyAgreePct: number | null; energyR: number | null; valenceR: number | null }
  export function measureAccuracy(pairs: { features: Features; analysis: AudioAnalysis }[], bpmRange: [number, number]): Accuracy;
  // pairs = tracks with source "reccobeats" AND an analysis; pct rounded to integers; null when the n for that metric is 0
  ```
- Produces (`merge.ts`):
  ```ts
  export function mergeAnalysis(f: Features, a: AudioAnalysis | undefined, cal: Calibration, useKey: boolean, bpmRange: [number, number]): Features;
  // bpm/rawBpm only if f.rawBpm is null; camelot only if f.camelot is null and useKey;
  // energy/valence = clamp01(fit ? a·proxy + b : proxy) whenever a exists; instrumentalness = 1 − moods.voice whenever a exists
  export function analysisTags(a: AudioAnalysis): string[];
  // top electronic class "house"/"techno" with prob ≥ 0.5 → that word;
  // each style with prob ≥ 0.3 whose label starts "Electronic---" → lowercased name ("deep house"); deduped
  ```

- [ ] **Step 1: Failing tests:**
  - `cosine of identical is 1, of orthogonal is 0`; `centroid is unit length`; `medoid picks the central vector`.
  - `linearFit recovers y = 2x + 0.1 with r ≈ 1`; `linearFit returns null below 10 points`; `calibrate drops fits with r < 0.5`.
  - `measureAccuracy treats 64 vs 128 BPM as agreeing` (half/double via `normalizeTempo` into `[110,150]`); `counts Camelot neighbours as agreeing`; `bpm off by 3% disagrees`.
  - `mergeAnalysis keeps reccobeats bpm and camelot`; `fills bpm and camelot from analysis when missing`; `ignores analysis camelot when useKey is false`; `uses the calibrated energy and falls back to the raw proxy`; `leaves features unchanged without analysis`.
  - `analysisTags maps styles and electronic class` (`[["Electronic---Deep House",0.6],["Electronic---Techno",0.2],["Rock---Indie Rock",0.5]]`, electronic house 0.7 → `["house","deep house"]`).
- [ ] **Step 2:** `npx vitest run src/mix`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: similarity, calibration, accuracy and merge helpers`.

### Task 6: Profiles and coverage use the analysis

**Files:**
- Modify: `src/data/profile.ts`, `src/data/profile.test.ts`, `src/mix/plan.ts`, `src/mix/plan.test.ts`, `src/components/NewSet.tsx` (failure sum + `analysis` stage label «Ανάλυση ήχου…»)

**Interfaces:**
- Consumes: `analyzeTracks` (Task 4); `calibrate`, `measureAccuracy`, `mergeAnalysis`, `analysisTags` (Task 5).
- Produces:
  ```ts
  // TrackProfile gains:
  embedding: Float32Array | null; styles: [string, number][];
  // hasEnoughData = features.bpm !== null && (genreSignal || embedding !== null)
  // tags = Last.fm tags ∪ analysisTags(a)
  export interface FailedLookups { features: number; tags: number; analysis: number }
  buildProfiles(tracks, opts: { bpmRange; onProgress?; signal?: AbortSignal; analyze?: typeof analyzeTracks })
    : Promise<{ profiles: TrackProfile[]; failed: FailedLookups; accuracy: Accuracy }>
  // Coverage gains: withEmbedding: number; accuracy: Accuracy | null
  computeCoverage(all, failed = 0, accuracy: Accuracy | null = null): Coverage
  planSet(profiles, spec, g, failed = 0, accuracy: Accuracy | null = null): SetPlan
  ```
  Order inside `buildProfiles`:
  1. features, tags, analysis;
  2. `pairs` = tracks with ReccoBeats data and an analysis;
  3. `accuracy = measureAccuracy(pairs)`;
  4. `useKey = accuracy.keyAgreePct === null || accuracy.keyAgreePct >= 60`;
  5. `cal = calibrate(pairs)`;
  6. merge per track.

- [ ] **Step 1: Failing tests** in `profile.test.ts` (inject `analyze`):
  - `has enough data with bpm and an embedding but no tags`;
  - `adds analysis tags to tags`;
  - `fills bpm from analysis when reccobeats has none`;
  - `counts analysis failures`;
  - `passes the signal to analysis`.

  In `plan.test.ts`:
  - `coverage counts embeddings and carries accuracy`;
  - `go needs 80% and zero failures` (with fingerprint-only tracks counting as enough).
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement. Update the existing tests that assert the exact `failed` shape.
- [ ] **Step 4:** `npm test` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: profiles and coverage use audio analysis`.

### Task 7: Sound neighbourhood in selection and ordering

**Files:**
- Modify: `src/mix/spec.ts`, `src/mix/select.ts`, `src/mix/order.ts`, `src/mix/plan.ts` (`BRIDGE_COST` 1.5 → 2.0), and their tests

**Interfaces:**
- Consumes: `cosine`, `centroid`, `medoid` (Task 5); `TrackProfile.embedding` (Task 6); `SIM_MIN` from the Spike findings.
- Produces:
  - `SetSpec.refTrackIds: string[]` (default `[]`; `validateSpec` errors on more than 5: «Έως 5 tracks αναφοράς.»).
  - `select.ts`: `export const SIM_MIN = <Spike findings value>`. `Selection` gains `center: "refs" | "medoid" | null`.
  - `order.ts`: `export const SOUND_WEIGHT = 0.5`, and `soundDistance(a: TrackProfile, b: TrackProfile): number` = `0` if either embedding is missing, else `clamp01((1 − cosine) / (2 · (1 − SIM_MIN)))`. `transitionCost` adds `SOUND_WEIGHT · soundDistance`.
- Selection rule, after the existing gates:
  - `center` = centroid of the reference tracks that have an embedding. If there are none, it is the embedding of the medoid of the passed tracks that have one. If no passed track has an embedding, it is `null` (behaviour as today).
  - When `center` is set, a passed track is moved to excluded with reason `"sound"` if it has no embedding or `cosine(embedding, center) < SIM_MIN`.

- [ ] **Step 1: Failing tests:**
  - `select.test.ts`:
    - `keeps tracks near the reference centroid and excludes far ones as sound`;
    - `ignores reference tracks without embedding`;
    - `uses the medoid when there are no references`;
    - `behaves as before when no track has an embedding` (existing fixtures, `center === null`);
    - `excludes tracks without embedding when a center exists`.
  - `order.test.ts`:
    - `soundDistance is 0 without embeddings`;
    - `orders similar-sounding tracks next to each other` (equal BPM, key and energy; two clusters A, B → the order never alternates A/B/A).
  - `spec.test.ts`: `rejects more than 5 reference tracks`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement. Existing `select`/`order`/`plan` tests must stay green.
- [ ] **Step 4:** `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: sound neighbourhood in selection and ordering`.

### Task 8: UI: reference tracks, analysis progress, cancel, accuracy, attribution

**Files:**
- Create: `src/components/RefPicker.tsx`
- Modify: `src/components/NewSet.tsx`, `src/components/SpecForm.tsx`, `src/components/Result.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: `SetSpec.refTrackIds`, `Coverage.withEmbedding`, `Coverage.accuracy`, `Selection.center`, `buildProfiles({ signal })`.
- Produces: `RefPicker({ source, playlistId, value, onChange }: { source: Source; playlistId: string; value: string[]; onChange(ids: string[]): void })`. It:
  - loads the source's tracks on its first click («Διάλεξε tracks αναφοράς»);
  - filters them by text over title and artist, showing up to 20 matches;
  - shows each pick as a removable chip, up to 5;
  - clears the picks when the source or playlist changes.

- [ ] **Step 1:** `RefPicker` below the source card. `NewSet`:
  - progress `Ανάλυση ήχου ${done}/${total}`;
  - an «Ακύρωση» button while busy (an `AbortController` passed to `buildProfiles`); an `AbortError` shows «Ακυρώθηκε.» with no error styling;
  - `planSet(..., failed.features + failed.tags + failed.analysis, accuracy)`.
- [ ] **Step 2:** `Result`:
  - the counts line becomes «Από N tracks: X με BPM, Y με αποτύπωμα ήχου, Z με tags είδους.»;
  - when `accuracy.n > 0`, add «Ακρίβεια ανάλυσης σε {n} tracks: BPM {bpmAgreePct}% · key {keyAgreePct}% · ενέργεια r={energyR} · διάθεση r={valenceR}» (2 decimals; «—» for null);
  - when `selection.center` is set, add «Ήχος: γύρω από τα tracks αναφοράς» or «Ήχος: γύρω από το πιο κεντρικό track».
- [ ] **Step 3:** `App` footer: «Μοντέλα: MTG Essentia (CC BY-NC-SA 4.0) · Δείγματα ήχου: Deezer», linking to essentia.upf.edu/models.html and deezer.com.
- [ ] **Step 4:** `npm run typecheck`, `npm test`, `npm run build`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: reference tracks, analysis progress and accuracy in UI`.

### Task 9: Cleanup, licence, and the House measurement

**Files:**
- Delete: `spike.html`, `src/spike/`; remove `spike.html` from the Vite inputs
- Create: `LICENSE` (AGPL-3.0 text from `https://www.gnu.org/licenses/agpl-3.0.txt`)
- Modify: `package.json` (`"license": "AGPL-3.0-only"`), `README.md` (coverage result, `npm run models` in local setup, structure), `docs/BACKLOG.md`, `CLAUDE.md` (current state)

- [ ] **Step 1:** Delete the spike, add `LICENSE` + the `license` field, and update the README local-setup step (`npm run models` after `npm install`).
- [ ] **Step 2:** `npm test`, `npm run typecheck`, `npm run build`. Expected: PASS. Push.
- [ ] **Step 3:** Ask the user to run «Φτιάξε το set» on «House» (twice if the first run has failures) and send the coverage, counts and accuracy lines.
- [ ] **Step 4:** Record the result in the README «Τρέχουσα κατάσταση» and in `CLAUDE.md`. Go = ≥ 80% and 0 failures. Add any accuracy miss (BPM < 90%, key < 60%, r < 0.5) to `docs/BACKLOG.md`.
- [ ] **Step 5:** Commit: `docs: audio analysis coverage result`.

---

## Spike findings

_To be filled in Task 1, Step 5._

| Item | Value |
|---|---|
| effnet ONNX input / outputs | |
| head ONNX input / output | |
| mel parameters / essentia.js import in worker | |
| `ort.env.wasm.wasmPaths` | |
| ms per track (median, max) | |
| BPM agreement (n=20) | |
| key agreement (n=20) | |
| median cosine same-family / cross-family | |
| **`SIM_MIN`** | |
| Go / no-go | |
