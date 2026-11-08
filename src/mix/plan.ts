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
export interface Coverage {
  total: number;
  withBpm: number;
  withGenre: number;
  enough: number;
  enoughPct: number;
  usable: number; // enough data AND energy or valence present, so the mood gate can judge the track
  usablePct: number;
  failed: number; // lookups that failed in this run (features + tags + genres); the verdict is unreliable while > 0
  go: boolean;
}
export interface SetPlan {
  spec: SetSpec;
  items: SetItem[];
  totalSec: number;
  shortfallMin: number;
  selection: Selection;
  coverage: Coverage;
}

/** Data coverage over ALL source profiles, one per track id. A genre signal means the track has at least one tag. */
export function computeCoverage(all: TrackProfile[], failed = 0): Coverage {
  const profiles = [...new Map(all.map((p) => [p.track.id, p])).values()];
  const total = profiles.length;
  const withBpm = profiles.filter((p) => p.features.bpm !== null).length;
  const withGenre = profiles.filter((p) => p.tags.length > 0).length;
  const enough = profiles.filter((p) => p.hasEnoughData).length;
  const usable = profiles.filter((p) => p.hasEnoughData && (p.features.energy !== null || p.features.valence !== null)).length;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
  const enoughPct = pct(enough);
  return { total, withBpm, withGenre, enough, enoughPct, usable, usablePct: pct(usable), failed, go: enoughPct >= 80 && failed === 0 };
}

const length = (s: Segment) => s.endSec - s.startSec;

function segmentFor(p: TrackProfile, mode: SetSpec["cutStyle"]): Segment {
  return planSegment({ durationSec: p.track.durationSec, bpm: p.features.bpm, mode });
}

/** Order the tracks, then give each a role and the segment that role implies. */
function arrange(taken: TrackProfile[], spec: SetSpec, g: GenreProfile): SetItem[] {
  const ordered = orderTracks(taken, spec, g);
  return ordered.map((profile, i) => {
    const prev = i > 0 ? transitionCost(ordered[i - 1], profile, g) : 0;
    const next = i < ordered.length - 1 ? transitionCost(profile, ordered[i + 1], g) : 0;
    const role: Role = prev > BRIDGE_COST || next > BRIDGE_COST ? "bridge" : "main";
    const mode = spec.cutStyle === "full" ? "full" : role === "bridge" ? "fast" : spec.cutStyle;
    return { profile, role, segment: segmentFor(profile, mode) };
  });
}

const totalOf = (items: SetItem[]) => items.reduce((acc, it) => acc + length(it.segment), 0);

export function planSet(profiles: TrackProfile[], spec: SetSpec, g: GenreProfile = HOUSE_TECHNO, failed = 0): SetPlan {
  const selection = selectTracks(profiles, spec, g);
  const targetSec = spec.durationMin * 60;
  const passed = selection.passed.map((s) => s.profile);

  // Take passed tracks (best first) until their spec-cut lengths cover `need` seconds; at least one.
  let used = 0;
  const take = (need: number) => {
    do need -= length(segmentFor(passed[used++], spec.cutStyle));
    while (need > 0 && used < passed.length);
  };

  let items: SetItem[] = [];
  let totalSec = 0;
  // Bridges get shorter cuts than estimated, so refill and re-arrange until the duration is met
  // or the passed tracks run out. Each round takes at least one track: bounded by passed.length.
  while (totalSec < targetSec && used < passed.length) {
    take(targetSec - totalSec);
    items = arrange(passed.slice(0, used), spec, g);
    totalSec = totalOf(items);
  }

  const shortfallMin = Math.max(0, Math.ceil((targetSec - totalSec) / 60));
  return { spec, items, totalSec, shortfallMin, selection, coverage: computeCoverage(profiles, failed) };
}
