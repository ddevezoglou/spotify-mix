// Local history of generated sets (localStorage, newest last, max 20).
// Stores a compact summary, not the full SetPlan with every profile, to stay well inside the quota.
import type { Segment } from "../mix/music";
import type { Coverage, Role, SetPlan } from "../mix/plan";
import type { ExcludeReason } from "../mix/select";
import type { SetSpec } from "../mix/spec";

const KEY = "sm.sets.v2"; // v1 stored full SetPlans; that shape is not read anymore
const MAX_SETS = 20;

export interface SavedItem {
  id: string;
  uri: string;
  name: string;
  artists: string;
  bpm: number | null;
  camelot: string | null;
  energy: number | null;
  segment: Segment;
  role: Role;
}

export interface SavedSet {
  id: string;
  spec: SetSpec;
  items: SavedItem[];
  totalSec: number;
  shortfallMin: number;
  coverage: Coverage;
  excludedCounts: Record<ExcludeReason, number>;
  playlistUrl?: string;
  createdAt: number;
}

function read(): SavedSet[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function toSavedSet(plan: SetPlan, id: string, playlistUrl?: string): SavedSet {
  const excludedCounts: Record<ExcludeReason, number> = { "no-data": 0, bpm: 0, mood: 0, genre: 0, sound: 0, duplicate: 0 };
  for (const { reason } of plan.selection.excluded) excludedCounts[reason]++;
  return {
    id,
    spec: plan.spec,
    items: plan.items.map(({ profile: { track, features }, segment, role }) => ({
      id: track.id,
      uri: track.uri,
      name: track.name,
      artists: track.artists,
      bpm: features.bpm,
      camelot: features.camelot,
      energy: features.energy,
      segment,
      role,
    })),
    totalSec: plan.totalSec,
    shortfallMin: plan.shortfallMin,
    coverage: plan.coverage,
    excludedCounts,
    playlistUrl,
    createdAt: Date.now(),
  };
}

/** Returns the new set's id, or null when it could not be stored (storage full or blocked). */
export function saveSet(plan: SetPlan, playlistUrl?: string): string | null {
  const id = crypto.randomUUID();
  const sets = [...read(), toSavedSet(plan, id, playlistUrl)].slice(-MAX_SETS);
  try {
    localStorage.setItem(KEY, JSON.stringify(sets));
    return id;
  } catch {
    return null;
  }
}

export const listSets = (): { id: string; name: string; createdAt: number }[] =>
  read().map(({ id, spec, createdAt }) => ({ id, name: spec.name, createdAt }));

export const loadSet = (id: string): SavedSet | null => read().find((s) => s.id === id) ?? null;
