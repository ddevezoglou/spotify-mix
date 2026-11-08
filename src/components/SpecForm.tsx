import { HOUSE_TECHNO } from "../mix/genres";
import { validateSpec, type CutStyle, type SetSpec, type Vocals } from "../mix/spec";

interface Props {
  value: SetSpec;
  onChange(s: SetSpec): void;
}

const VOCALS: [Vocals, string][] = [["none", "όχι"], ["some", "λίγα"], ["any", "αδιάφορο"]];
const CUTS: [CutStyle, string][] = [["full", "ολόκληρα"], ["club", "club"], ["fast", "γρήγορο"]];

export function SpecForm({ value, onChange }: Props) {
  const set = (patch: Partial<SetSpec>) => onChange({ ...value, ...patch });
  const num = (v: string, fallback: number) => (v === "" || Number.isNaN(Number(v)) ? fallback : Number(v));
  const errors = validateSpec(value);

  const toggleGenre = (g: string) =>
    set({ genres: value.genres.includes(g) ? value.genres.filter((x) => x !== g) : [...value.genres, g] });

  return (
    <div className="card">
      <h2>Προδιαγραφές set</h2>

      <p>
        <label>
          Όνομα <input value={value.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
      </p>

      <h3>Είδη</h3>
      {Object.entries(HOUSE_TECHNO.families).map(([family, tags]) => (
        <div key={family} className="row">
          <b>{family}</b>
          {tags.map((g) => (
            <label key={g}>
              <input type="checkbox" checked={value.genres.includes(g)} onChange={() => toggleGenre(g)} /> {g}
            </label>
          ))}
        </div>
      ))}

      <div className="row">
        <label>
          BPM από{" "}
          <input type="number" value={value.bpm[0]} onChange={(e) => set({ bpm: [num(e.target.value, value.bpm[0]), value.bpm[1]] })} />
        </label>
        <label>
          έως{" "}
          <input type="number" value={value.bpm[1]} onChange={(e) => set({ bpm: [value.bpm[0], num(e.target.value, value.bpm[1])] })} />
        </label>
      </div>

      <p>
        <label>
          Ενέργεια ({value.energy.toFixed(2)}){" "}
          <input type="range" min={0} max={1} step={0.05} value={value.energy} onChange={(e) => set({ energy: Number(e.target.value) })} />
        </label>
      </p>
      <p>
        <label>
          σκοτεινό ↔ φωτεινό ({value.valence.toFixed(2)}){" "}
          <input type="range" min={0} max={1} step={0.05} value={value.valence} onChange={(e) => set({ valence: Number(e.target.value) })} />
        </label>
      </p>
      <p>
        <label>
          Κύματα ({value.wave.toFixed(2)}){" "}
          <input type="range" min={0} max={0.3} step={0.01} value={value.wave} onChange={(e) => set({ wave: Number(e.target.value) })} />
        </label>
      </p>

      <div className="row">
        <b>Φωνητικά</b>
        {VOCALS.map(([v, label]) => (
          <label key={v}>
            <input type="radio" name="vocals" checked={value.vocals === v} onChange={() => set({ vocals: v })} /> {label}
          </label>
        ))}
      </div>

      <p>
        <label>
          Λέξεις ήχου (χωρισμένες με κόμμα){" "}
          <input
            defaultValue={value.soundTags.join(", ")}
            onChange={(e) => set({ soundTags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
          />
        </label>
      </p>

      <p>
        <label>
          Διάρκεια (λεπτά){" "}
          <input type="number" value={value.durationMin} onChange={(e) => set({ durationMin: num(e.target.value, value.durationMin) })} />
        </label>
      </p>

      <div className="row">
        <b>Στυλ κοψίματος</b>
        {CUTS.map(([c, label]) => (
          <label key={c}>
            <input type="radio" name="cutStyle" checked={value.cutStyle === c} onChange={() => set({ cutStyle: c })} /> {label}
          </label>
        ))}
      </div>

      {errors.length > 0 && (
        <ul className="error">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
