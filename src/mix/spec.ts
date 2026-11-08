import { HOUSE_TECHNO } from "./genres";

export type Vocals = "none" | "some" | "any";
export type CutStyle = "full" | "club" | "fast";

export interface SetSpec {
  name: string;
  genres: string[]; // values from genreVocabulary()
  bpm: [number, number];
  energy: number; // 0..1 target
  wave: number; // 0..0.3, amplitude of the small waves
  valence: number; // 0 dark .. 1 bright
  vocals: Vocals;
  soundTags: string[]; // free words matched against TrackProfile.soundTags
  durationMin: number; // 30..720
  cutStyle: CutStyle;
}

export const DEFAULT_SPEC: SetSpec = {
  name: "Νέο set",
  genres: ["house"],
  bpm: [120, 126],
  energy: 0.6,
  wave: 0.1,
  valence: 0.5,
  vocals: "any",
  soundTags: [],
  durationMin: 60,
  cutStyle: "club",
};

const outside = (v: number, lo: number, hi: number) => !(v >= lo && v <= hi);

export function validateSpec(s: SetSpec): string[] {
  const errors: string[] = [];
  const [lo, hi] = HOUSE_TECHNO.bpmRange;
  if (s.genres.length === 0) errors.push("Διάλεξε τουλάχιστον ένα είδος.");
  if (s.bpm[0] > s.bpm[1]) errors.push("Το ελάχιστο BPM είναι μεγαλύτερο από το μέγιστο.");
  if (outside(s.bpm[0], lo, hi) || outside(s.bpm[1], lo, hi)) errors.push(`Το BPM πρέπει να είναι ανάμεσα σε ${lo} και ${hi}.`);
  if (outside(s.energy, 0, 1)) errors.push("Η ενέργεια πρέπει να είναι από 0 έως 1.");
  if (outside(s.valence, 0, 1)) errors.push("Το σκοτεινό/φωτεινό πρέπει να είναι από 0 έως 1.");
  if (outside(s.wave, 0, 0.3)) errors.push("Τα κύματα πρέπει να είναι από 0 έως 0,3.");
  if (outside(s.durationMin, 30, 720)) errors.push("Η διάρκεια πρέπει να είναι από 30 έως 720 λεπτά.");
  return errors;
}
