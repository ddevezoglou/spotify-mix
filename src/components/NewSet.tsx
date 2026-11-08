import { useEffect, useState } from "react";
import { buildProfiles } from "../data/profile";
import { HOUSE_TECHNO } from "../mix/genres";
import { planSet, type SetPlan } from "../mix/plan";
import { DEFAULT_SPEC, validateSpec, type SetSpec } from "../mix/spec";
import { getMyPlaylists, getPlaylistTracks, getSavedTracks, SpotifyError, type Playlist } from "../spotify/api";
import { SpecForm } from "./SpecForm";

export type Source = "playlist" | "saved";

/** Form state, owned by App so it survives «← Νέο set» and the player tab. */
export interface NewSetForm {
  spec: SetSpec;
  source: Source;
  playlistId: string;
}

export const INITIAL_FORM: NewSetForm = { spec: DEFAULT_SPEC, source: "playlist", playlistId: "" };

const LOADING = "Φόρτωση tracks…";
const STAGES: Record<string, string> = {
  features: "Στοιχεία ήχου…",
  tags: "Tags…",
  genres: "Είδη καλλιτεχνών…",
};

interface Props {
  myId: string;
  form: NewSetForm;
  onForm(patch: Partial<NewSetForm>): void;
  onPlan(plan: SetPlan): void;
}

export function NewSet({ myId, form, onForm, onPlan }: Props) {
  const { spec, source, playlistId } = form;
  const setSpec = (s: SetSpec) => onForm({ spec: s });
  const setSource = (s: Source) => onForm({ source: s });
  const setPlaylistId = (id: string) => onForm({ playlistId: id });
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyPlaylists(myId)
      .then((all) => setPlaylists(all.filter((p) => p.owned)))
      .catch((e) => setError(String(e instanceof Error ? e.message : e)));
  }, [myId]);

  const busy = progress !== null;
  const canRun = !busy && validateSpec(spec).length === 0 && (source === "saved" || playlistId !== "");

  async function run() {
    setError(null);
    setProgress(LOADING);
    try {
      const tracks =
        source === "saved"
          ? await getSavedTracks((n) => setProgress(`${LOADING} ${n}`))
          : await getPlaylistTracks(playlistId, (n) => setProgress(`${LOADING} ${n}`));
      const { profiles, failed } = await buildProfiles(tracks, {
        bpmRange: HOUSE_TECHNO.bpmRange,
        onProgress: (stage, done, total) => setProgress(`${STAGES[stage] ?? stage} ${done}/${total}`),
      });
      onPlan(planSet(profiles, spec, HOUSE_TECHNO, failed.features + failed.tags + failed.genres));
    } catch (e) {
      if (source === "saved" && e instanceof SpotifyError && e.status === 403) {
        setError("Το Spotify δεν επιτρέπει ανάγνωση των Saved για αυτό το app.");
      } else {
        setError(String(e instanceof Error ? e.message : e));
      }
    } finally {
      setProgress(null);
    }
  }

  return (
    <section>
      <div className="card">
        <h2>Πηγή tracks</h2>
        <div className="row">
          <label>
            <input type="radio" name="source" checked={source === "playlist"} onChange={() => setSource("playlist")} /> Playlist
          </label>
          <label>
            <input type="radio" name="source" checked={source === "saved"} onChange={() => setSource("saved")} /> Saved
          </label>
        </div>
        {source === "playlist" && (
          <>
            <select value={playlistId} onChange={(e) => setPlaylistId(e.target.value)}>
              <option value="">— διάλεξε playlist —</option>
              {playlists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <p className="muted">
              Βλέπεις μόνο playlists που σου ανήκουν. Για playlist άλλου, πρώτα πάτα στο Spotify "Προσθήκη σε άλλη playlist → Νέα
              playlist".
            </p>
          </>
        )}
      </div>

      <SpecForm value={spec} onChange={setSpec} />

      <div className="row">
        <button disabled={!canRun} onClick={run}>
          Φτιάξε το set
        </button>
        {progress && <span className="muted">{progress}</span>}
      </div>
      {error && (
        <p className="error">
          {error}{" "}
          <button className="ghost" onClick={run} disabled={!canRun}>
            Δοκίμασε ξανά
          </button>
        </p>
      )}
    </section>
  );
}
