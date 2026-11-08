// Set planning: fill the requested duration from selected tracks, cut each by its role, report shortfall.
import type { TrackProfile } from "../data/profile";
import { HOUSE_TECHNO, type GenreProfile } from "./genres";
import { planSegment, type Segment } from "./music";
import { orderTracks, transitionCost } from "./order";
import { selectTracks, type Selection } from "./select";
import type { SetSpec } from "./spec";

const BRIDGE_COST = 1.5; // transition cost above this makes a track a short bridge

export type Role = "main" | "bridge";
export interface SetItem { profile: TrackProfile; segment: Segment; role: Role }
export interface Coverage { total: number; withBpm: number; withGenre: number; enough: number; enoughPct: number; go: boolean }
export interface SetPlan {
  spec: SetSpec;
  items: SetItem[];
  totalSec: number;
  shortfallMin: number;
  selection: Selection;
  coverage: Coverage;
}

/** Data coverage over ALL source profiles. A genre signal means the track has at least one tag. */
export function computeCoverage(profiles: TrackProfile[]): Coverage {
  const total = profiles.length;
  const withBpm = profiles.filter((p) => p.features.bpm !== null).length;
  const withGenre = profiles.filter((p) => p.tags.length > 0).length;
  const enough = profiles.filter((p) => p.hasEnoughData).length;
  const enoughPct = total === 0 ? 0 : Math.round((enough / total) * 100);
  return { total, withBpm, withGenre, enough, enoughPct, go: enoughPct >= 80 };
}

const length = (s: Segment) => s.endSec - s.startSec;

function segmentFor(p: TrackProfile, mode: SetSpec["cutStyle"]): Segment {
  return planSegment({ durationSec: p.track.durationSec, bpm: p.features.bpm, mode });
}

export function planSet(profiles: TrackProfile[], spec: SetSpec, g: GenreProfile = HOUSE_TECHNO): SetPlan {
  const selection = selectTracks(profiles, spec, g);
  const targetSec = spec.durationMin * 60;

  const taken: TrackProfile[] = [];
  let sum = 0;
  for (const { profile } of selection.passed) {
    if (sum >= targetSec) break;
    taken.push(profile);
    sum += length(segmentFor(profile, spec.cutStyle));
  }

  const ordered = orderTracks(taken, spec, g);
  const items: SetItem[] = ordered.map((profile, i) => {
    const prev = i > 0 ? transitionCost(ordered[i - 1], profile, g) : 0;
    const next = i < ordered.length - 1 ? transitionCost(profile, ordered[i + 1], g) : 0;
    const role: Role = prev > BRIDGE_COST || next > BRIDGE_COST ? "bridge" : "main";
    const mode = spec.cutStyle === "full" ? "full" : role === "bridge" ? "fast" : spec.cutStyle;
    return { profile, role, segment: segmentFor(profile, mode) };
  });

  const totalSec = items.reduce((acc, it) => acc + length(it.segment), 0);
  const shortfallMin = Math.max(0, Math.ceil((targetSec - totalSec) / 60));
  return { spec, items, totalSec, shortfallMin, selection, coverage: computeCoverage(profiles) };
}
