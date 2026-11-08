# Spotify Mix

Προσωπικός DJ-set player πάνω στο Spotify. Πλάνο: [PLAN.md](PLAN.md).

**Τρέχουσα φάση: 0 (Spike)**: ελέγχουμε ότι όλα δουλεύουν πριν χτίσουμε.

## Setup (μία φορά)

1. Μπες στο [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) με λογαριασμό **Premium** → **Create app**.
   - APIs: **Web API** και **Web Playback SDK**
   - Redirect URI: `http://127.0.0.1:5173/` (με την κάθετο στο τέλος)
2. Αντέγραψε το **Client ID**.
3. Φτιάξε αρχείο `.env.local` στον φάκελο του project:
   ```
   VITE_SPOTIFY_CLIENT_ID=το_client_id_σου
   ```
4. Εγκατάσταση και εκκίνηση:
   ```bash
   npm install
   npm run dev
   ```
5. Άνοιξε **http://127.0.0.1:5173/** στο **Chrome** (όχι `localhost`, γιατί το Spotify το απορρίπτει).

## Τι δοκιμάζουμε στη Φάση 0

| Οθόνη | Ερώτηση | Επιτυχία όταν |
|---|---|---|
| **Player test** | Παίζει μόνο ένα κομμάτι του track και περνά στο επόμενο με fade; | Ακούς το set με σωστά σημεία έναρξης/λήξης και ομαλές μεταβάσεις. |
| **Coverage test** | Πόσα από τα δικά σου tracks έχουν BPM / key; | ≥ 80% με BPM σε μια techno/house playlist σου. |

## Εντολές

| Εντολή | Τι κάνει |
|---|---|
| `npm run dev` | Τρέχει το app τοπικά |
| `npm test` | Unit tests (Vitest) |
| `npm run build` | Έλεγχος τύπων + build για GitHub Pages |

## Δομή

```
src/
  spotify/auth.ts      Login (PKCE, χωρίς server)
  spotify/api.ts       Κλήσεις Spotify Web API
  spotify/player.ts    Web Playback SDK + αναπαραγωγή set με fades
  data/features.ts     BPM / key / energy από ReccoBeats και Deezer
  mix/music.ts         Διόρθωση BPM, Camelot, επιλογή τμήματος (cue)
  components/          Οθόνες Player test και Coverage test
```
