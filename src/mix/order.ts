// Set ordering: harmonic + tempo transition cost, steady energy curve, greedy + 2-opt.
import type { TrackProfile } from "../data/profile";
import { HOUSE_TECHNO, type GenreProfile } from "./genres";
import type { SetSpec } from "./spec";

const MISSING_ENERGY = 0.2;
const ENERGY_WEIGHT = 2;
const TWO_OPT_BUDGET_MS = 2000;

function parseCamelot(c: string): { n: number; letter: string } | null {
  const m = /^(\d{1,2})([AB])$/.exec(c);
  return m ? { n: Number(m[1]), letter: m[2] } : null;
}

export function camelotDistance(a: string | null, b: string | null): 0 | 0.3 | 0.5 | 1 {
  if (a === null || b === null) return 0.5;
  const pa = parseCamelot(a);
  const pb = parseCamelot(b);
  if (!pa || !pb) return 0.5;
  if (pa.n === pb.n && pa.letter === pb.letter) return 0;
  if (pa.n === pb.n) return 0.3; // A <-> B
  if (pa.letter === pb.letter) {
    const diff = Math.abs(pa.n - pb.n);
    if (diff === 1 || diff === 11) return 0.3; // neighbours, 12 wraps to 1
  }
  return 1;
}

export function bpmCost(a: number, b: number, tolerance: number): number {
  const d = Math.abs(a - b) / Math.min(a, b);
  if (d <= 0.02) return 0;
  if (d <= tolerance) return (d - 0.02) / (tolerance - 0.02);
  return 3;
}

export function energyTarget(index: number, spec: SetSpec): number {
  return spec.energy + spec.wave * Math.sin((2 * Math.PI * index) / 8);
}

export function transitionCost(a: TrackProfile, b: TrackProfile, g: GenreProfile = HOUSE_TECHNO): number {
  const ba = a.features.bpm;
  const bb = b.features.bpm;
  const bpmPart = ba === null || bb === null ? 1 : bpmCost(ba, bb, g.bpmTolerance);
  return bpmPart + camelotDistance(a.features.camelot, b.features.camelot);
}

const energyOf = (p: TrackProfile) => p.features.energy ?? MISSING_ENERGY;

export function pathCost(order: TrackProfile[], spec: SetSpec, g: GenreProfile = HOUSE_TECHNO): number {
  let cost = 0;
  for (let i = 0; i < order.length; i++) {
    if (i > 0) cost += transitionCost(order[i - 1], order[i], g);
    cost += ENERGY_WEIGHT * Math.abs(energyOf(order[i]) - energyTarget(i, spec));
  }
  return cost;
}

function pickStart(items: TrackProfile[], spec: SetSpec): number {
  const target = energyTarget(0, spec);
  const bpmOf = (p: TrackProfile) => p.features.bpm ?? Infinity;
  let best = -1;
  let bestInRange = false;
  items.forEach((p, i) => {
    const inRange = Math.abs(energyOf(p) - target) <= 0.1;
    const better =
      best < 0 ||
      (inRange && !bestInRange) ||
      (inRange === bestInRange && bpmOf(p) < bpmOf(items[best]));
    if (better) {
      best = i;
      bestInRange = inRange;
    }
  });
  return best;
}

function greedy(items: TrackProfile[], spec: SetSpec, g: GenreProfile): TrackProfile[] {
  const remaining = [...items];
  const order = [remaining.splice(pickStart(remaining, spec), 1)[0]];
  while (remaining.length > 0) {
    const last = order[order.length - 1];
    const next = order.length;
    let bi = 0;
    let bc = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const c = transitionCost(last, remaining[i], g) + ENERGY_WEIGHT * Math.abs(energyOf(remaining[i]) - energyTarget(next, spec));
      if (c < bc) {
        bc = c;
        bi = i;
      }
    }
    order.push(remaining.splice(bi, 1)[0]);
  }
  return order;
}

function twoOpt(start: TrackProfile[], spec: SetSpec, g: GenreProfile): TrackProfile[] {
  const deadline = performance.now() + TWO_OPT_BUDGET_MS;
  let order = start;
  let cost = pathCost(order, spec, g);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        if (performance.now() > deadline) return order;
        const cand = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
        const c = pathCost(cand, spec, g);
        if (c < cost - 1e-9) {
          order = cand;
          cost = c;
          improved = true;
        }
      }
    }
  }
  return order;
}

export function orderTracks(items: TrackProfile[], spec: SetSpec, g: GenreProfile = HOUSE_TECHNO): TrackProfile[] {
  if (items.length <= 1) return items;
  return twoOpt(greedy(items, spec, g), spec, g);
}
