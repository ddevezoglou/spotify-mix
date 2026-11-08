// Local history of generated sets (localStorage, newest last, max 20).
import type { SetPlan } from "../mix/plan";

const KEY = "sm.sets.v1";
const MAX_SETS = 20;

interface StoredSet {
  id: string;
  name: string;
  createdAt: number;
  playlistUrl?: string;
  plan: SetPlan;
}

function read(): StoredSet[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function saveSet(plan: SetPlan, playlistUrl?: string): string {
  const id = crypto.randomUUID();
  const sets = [...read(), { id, name: plan.spec.name, createdAt: Date.now(), playlistUrl, plan }].slice(-MAX_SETS);
  try {
    localStorage.setItem(KEY, JSON.stringify(sets));
  } catch {
    /* storage full or blocked: the set just isn't saved */
  }
  return id;
}

export const listSets = (): { id: string; name: string; createdAt: number }[] =>
  read().map(({ id, name, createdAt }) => ({ id, name, createdAt }));

export const loadSet = (id: string): SetPlan | null => read().find((s) => s.id === id)?.plan ?? null;
