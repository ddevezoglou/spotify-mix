// Pure music helpers: tempo cleanup, Camelot keys, phrase-aligned segment planning.
// Techno/house values for now; Phase 4 moves them into per-genre profiles.

export const TEMPO_RANGE: [number, number] = [110, 150];

/** Fix half/double-time tempo readings by picking the octave that falls in range. */
export function normalizeTempo(bpm: number | null | undefined, [min, max] = TEMPO_RANGE): number | null {
  if (!bpm || bpm <= 0) return null;
  for (const candidate of [bpm, bpm * 2, bpm / 2]) {
    if (candidate >= min && candidate <= max) return candidate;
  }
  return null;
}

const CAMELOT_MAJOR = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1]; // index = pitch class (C=0)
const CAMELOT_MINOR = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];

/** Pitch class (0-11) + mode (1 major, 0 minor) → Camelot code such as "8A". */
export function toCamelot(key: number, mode: number): string | null {
  if (key < 0 || key > 11) return null;
  return mode === 1 ? `${CAMELOT_MAJOR[key]}B` : `${CAMELOT_MINOR[key]}A`;
}

export const barSeconds = (bpm: number) => 240 / bpm; // 4 beats per bar

export type SegmentMode = "full" | "club" | "fast";

export interface Segment {
  startSec: number;
  endSec: number;
}

export const GRID_BARS = 16; // cues land on 16-bar phrase boundaries
export const SEGMENT_BARS: Record<Exclude<SegmentMode, "full">, number> = { fast: 64, club: 112 };
const CLUB_LEAD_IN_BARS = 48; // club mode starts with the groove before the drop

/**
 * Pick which part of a track to play. Heuristic: tracks start on a downbeat and are built
 * from 16/32-bar phrases; the main drop sits around the middle of an extended mix.
 */
export function planSegment(opts: { durationSec: number; bpm: number | null; mode: SegmentMode }): Segment {
  const { durationSec, bpm, mode } = opts;
  if (mode === "full" || !bpm) return { startSec: 0, endSec: durationSec };

  const bar = barSeconds(bpm);
  const phrase = bar * GRID_BARS;
  const snap = (t: number) => Math.floor(t / phrase + 1e-9) * phrase;

  const dropStart = snap(durationSec * (durationSec >= 300 ? 0.5 : 0.35));
  const length = SEGMENT_BARS[mode] * bar;
  let start = mode === "club" ? dropStart - CLUB_LEAD_IN_BARS * bar : dropStart;
  start = Math.max(0, start);
  if (start + length > durationSec) start = Math.max(0, snap(durationSec - length));

  return { startSec: start, endSec: Math.min(durationSec, start + length) };
}
