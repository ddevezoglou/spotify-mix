// Three-gate track selection: mood + genre + sound. A track must pass every gate.
import type { TrackProfile } from "../data/profile";
import { genreFamily, HOUSE_TECHNO, type GenreProfile } from "./genres";
import type { SetSpec } from "./spec";

export type ExcludeReason = "no-data" | "bpm" | "mood" | "genre" | "sound" | "duplicate";
export interface Scored { profile: TrackProfile; mood: number; genre: number; sound: number; total: number }
export interface Selection { passed: Scored[]; excluded: { profile: TrackProfile; reason: ExcludeReason }[] }

const MOOD_MIN = 0.5;
const MAX_MOOD_TERM = 0.6; // each available mood term (energy, valence) must also stay within this distance
const GENRE_MIN = 0.6;
const SOUND_MIN = 0.5;
const MISSING_TERM = 0.3;
const SOME_VOCALS_MIN_INSTRUMENTALNESS = 0.2;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Distance terms 0 (on target) .. 1 (far); null when the feature is missing. */
function moodTerms(p: TrackProfile, spec: SetSpec): { energy: number | null; valence: number | null } {
  const { energy, valence } = p.features;
  return {
    energy: energy === null ? null : clamp01(Math.max(0, Math.abs(energy - spec.energy) - spec.wave) / 0.4),
    valence: valence === null ? null : clamp01(Math.abs(valence - spec.valence) / 0.5),
  };
}

function moodScore(p: TrackProfile, spec: SetSpec): number {
  const t = moodTerms(p, spec);
  if (t.energy === null && t.valence === null) return 0.4;
  return 1 - ((t.energy ?? MISSING_TERM) + (t.valence ?? MISSING_TERM)) / 2;
}

function moodPasses(p: TrackProfile, spec: SetSpec, mood: number): boolean {
  const t = moodTerms(p, spec);
  return mood >= MOOD_MIN && [t.energy, t.valence].every((x) => x === null || x <= MAX_MOOD_TERM);
}

function genreScore(p: TrackProfile, spec: SetSpec, g: GenreProfile): number {
  const specFamilies = new Set(spec.genres.map((s) => genreFamily(s, g)).filter((f): f is string => f !== null));
  let best = 0;
  for (const tag of p.tags) {
    if (spec.genres.includes(tag)) return 1;
    const fam = genreFamily(tag, g);
    if (fam !== null && specFamilies.has(fam)) best = 0.6;
  }
  return best;
}

function soundScore(p: TrackProfile, spec: SetSpec): number {
  const inst = p.features.instrumentalness;
  if (spec.vocals === "none" && !p.soundTags.includes("instrumental")) return 0;
  if (spec.vocals === "some" && inst !== null && inst < SOME_VOCALS_MIN_INSTRUMENTALNESS) return 0;
  if (spec.soundTags.length === 0) return 1;
  const have = p.soundTags.map((t) => t.toLowerCase());
  const hits = spec.soundTags.filter((w) => have.some((t) => t.includes(w.toLowerCase()))).length;
  return hits === 0 ? 0 : 0.5 + 0.5 * (hits / spec.soundTags.length);
}

export function scoreTrack(p: TrackProfile, spec: SetSpec, g: GenreProfile = HOUSE_TECHNO): Scored {
  const mood = moodScore(p, spec);
  const genre = genreScore(p, spec, g);
  const sound = soundScore(p, spec);
  return { profile: p, mood, genre, sound, total: mood + genre + sound };
}

export function selectTracks(profiles: TrackProfile[], spec: SetSpec, g: GenreProfile = HOUSE_TECHNO): Selection {
  const passed: Scored[] = [];
  const excluded: Selection["excluded"] = [];
  // Registries of PASSED tracks only, so an excluded copy never blocks a usable one.
  const ids = new Set<string>();
  const isrcs = new Set<string>();
  for (const profile of profiles) {
    const { id, isrc } = profile.track;
    if (ids.has(id) || (isrc !== null && isrcs.has(isrc))) { excluded.push({ profile, reason: "duplicate" }); continue; }
    const { energy, valence } = profile.features;
    if (!profile.hasEnoughData || (energy === null && valence === null)) { excluded.push({ profile, reason: "no-data" }); continue; }
    const bpm = profile.features.bpm;
    if (bpm === null || bpm < spec.bpm[0] || bpm > spec.bpm[1]) { excluded.push({ profile, reason: "bpm" }); continue; }
    const s = scoreTrack(profile, spec, g);
    const reason: ExcludeReason | null = !moodPasses(profile, spec, s.mood) ? "mood" : s.genre < GENRE_MIN ? "genre" : s.sound < SOUND_MIN ? "sound" : null;
    if (reason) { excluded.push({ profile, reason }); continue; }
    passed.push(s);
    ids.add(id);
    if (isrc !== null) isrcs.add(isrc);
  }
  passed.sort((a, b) => b.total - a.total);
  return { passed, excluded };
}
