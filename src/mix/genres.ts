export interface GenreProfile {
  id: "house-techno";
  bpmRange: [number, number];
  phraseBars: 16;
  minSegmentBars: 64;
  bpmTolerance: 0.06;
  families: Record<string, string[]>; // family -> member tags
}

export const HOUSE_TECHNO: GenreProfile = {
  id: "house-techno",
  bpmRange: [110, 150],
  phraseBars: 16,
  minSegmentBars: 64,
  bpmTolerance: 0.06,
  families: {
    house: [
      "house", "deep house", "tech house", "progressive house", "afro house", "soulful house",
      "funky house", "jackin house", "organic house", "melodic house", "lo-fi house",
    ],
    techno: [
      "techno", "melodic techno", "minimal techno", "hard techno", "peak time techno",
      "dub techno", "acid techno", "industrial techno", "detroit techno",
    ],
    electronic: ["electronic", "dance", "edm", "minimal"],
  },
};

export function genreVocabulary(p: GenreProfile = HOUSE_TECHNO): string[] {
  return Object.values(p.families).flat();
}

export function genreFamily(tag: string, p: GenreProfile = HOUSE_TECHNO): string | null {
  for (const [family, tags] of Object.entries(p.families)) if (tags.includes(tag)) return family;
  return null;
}
