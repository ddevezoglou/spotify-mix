// Three-gate track selection: mood + genre + sound. A track must pass every gate.
import type { TrackProfile } from "../data/profile";
import { genreFamily, HOUSE_TECHNO, type GenreProfile } from "./genres";
import type { SetSpec } from "./spec";

export type ExcludeReason = "no-data" | "bpm" | "mood" | "genre" | "sound" | "duplicate";
export interface Scored { profile: TrackProfile; mood: number; genre: number; sound: number; total: number }
export interface Selection { passed: Scored[]; excluded: { profile: TrackProfile; reason: ExcludeReason }[] }

const MOOD_MIN = 0.5;
const GENRE_MIN = 0.6;
const SOUND_MIN = 0.5;
const MISSING_TERM = 0.3;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function moodScore(p: TrackProfile, spec: SetSpec): number {
  const { energy, valence } = p.features;
  if (energy === null && valence === null) return 0.4;
  const energyTerm = energy === null ? MISSING_TERM : clamp01(Math.max(0, Math.abs(energy - spec.energy) - spec.wave) / 0.4);
  const valenceTerm = valence === null ? MISSING_TERM : clamp01(Math.abs(valence - spec.valence) / 0.5);
  return 1 - (energyTerm + valenceTerm) / 2;
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
  if (spec.vocals === "some" && inst !== null && inst < 0.2 && !p.soundTags.includes("vocal") && !p.tags.includes("vocal")) return 0;
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
  const ids = new Set<string>();
  const isrcs = new Set<string>();
  for (const profile of profiles) {
    const { id, isrc } = profile.track;
    const dup = ids.has(id) || (isrc !== null && isrcs.has(isrc));
    ids.add(id);
    if (isrc !== null) isrcs.add(isrc);
    if (dup) { excluded.push({ profile, reason: "duplicate" }); continue; }
    if (!profile.hasEnoughData) { excluded.push({ profile, reason: "no-data" }); continue; }
    const bpm = profile.features.bpm;
    if (bpm === null || bpm < spec.bpm[0] || bpm > spec.bpm[1]) { excluded.push({ profile, reason: "bpm" }); continue; }
    const s = scoreTrack(profile, spec, g);
    const reason: ExcludeReason | null = s.mood < MOOD_MIN ? "mood" : s.genre < GENRE_MIN ? "genre" : s.sound < SOUND_MIN ? "sound" : null;
    if (reason) excluded.push({ profile, reason });
    else passed.push(s);
  }
  passed.sort((a, b) => b.total - a.total);
  return { passed, excluded };
}
