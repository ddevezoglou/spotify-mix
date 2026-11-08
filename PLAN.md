# Spotify Mix — Πλάνο Υλοποίησης

**Στόχος:** Web app (GitHub Pages). Ο χρήστης κάνει login με Spotify και ακούει δικά του DJ sets: σωστή σειρά, σωστό κομμάτι από κάθε track (π.χ. μόνο το drop), ανάλογα με διάθεση και είδος. Ξεκινάμε με techno / house.

**Λειτουργίες:**
- **A.** Νέα playlist από prompt
- **B.** Mix υπάρχουσας playlist
- **C.** A + B μαζί

---

## 1. Τι πρέπει να ξέρεις πριν ξεκινήσουμε

| Περιορισμός | Τι σημαίνει για εμάς |
|---|---|
| Το Spotify **έκοψε** BPM, key, energy και ανάλυση δομής (audio-features / audio-analysis) για νέες εφαρμογές. | Αυτά τα δεδομένα τα παίρνουμε από **άλλες πηγές** (βλ. §2). |
| **Development Mode (2026):** χρειάζεται Premium, μέχρι **5 χρήστες** ανά app, search έως 10 αποτελέσματα ανά κλήση, διαβάζεις μόνο **δικές σου** playlists. | Το app είναι για σένα και λίγους φίλους, όχι δημόσιο προϊόν. Για mix playlist άλλου, πρώτα την αντιγράφεις. |
| Μια playlist στο Spotify **δεν κρατάει** start/end χρόνους. | Το mix παίζει **μέσα στο app μας** (Web Playback SDK), όχι στο Spotify app. |
| Η πολιτική του Spotify **απαγορεύει ρητά** το να «επικαλύπτονται» ή να γίνονται mix τα tracks. Το να παίζεις μόνο ένα κομμάτι του track δεν απαγορεύεται ρητά (γκρίζα ζώνη). | Μεταβάσεις χωρίς επικάλυψη: **fade-out → άλμα στο σημείο του επόμενου → fade-in**. Ακούγεται σαν «radio edit», όχι σαν πραγματικό blend δύο κομματιών. |

**Συμπέρασμα:** Με Spotify φτιάχνουμε ένα έξυπνο «set player» για προσωπική χρήση. Αληθινό DJ blend (δύο tracks μαζί, beatmatching) γίνεται μόνο με **δικά σου αρχεία ήχου** (προαιρετική Φάση 5).

---

## 2. Από πού παίρνουμε τα δεδομένα των tracks

Για κάθε track θέλουμε: **BPM, key, energy, διάρκεια**.

1. **Spotify** → διάρκεια + ISRC (μοναδικός κωδικός track).
2. **ReccoBeats API** (δωρεάν) → BPM, key, energy με βάση το Spotify ID.
3. **Deezer API** (με ISRC) → BPM ως εφεδρεία.
4. Αν λείπουν όλα → εκτίμηση ή χειροκίνητη τιμή από τον χρήστη.

Όλα αποθηκεύονται σε **cache**, ώστε κάθε track να αναλύεται μία φορά.

> Η κάλυψη των πηγών για techno είναι το μεγαλύτερο ρίσκο. Το ελέγχουμε πρώτο (Φάση 0).

---

## 3. Πώς βρίσκουμε το «σωστό σημείο» (cue points)

Χωρίς ανάλυση ήχου, εκμεταλλευόμαστε ότι η techno/house είναι **πολύ τυποποιημένη**:

- 1 bar = 4 beats → διάρκεια bar = `240 / BPM` δευτ. (στα 128 BPM ≈ 1,9 δευτ.)
- Τα κομμάτια χτίζονται σε **φράσεις 16/32 bars** (στα 128 BPM, 32 bars ≈ 1 λεπτό).
- Τυπική δομή: intro → groove → breakdown → **drop** → outro.

**Αλγόριθμος:**
1. Χωρίζουμε το track σε φράσεις 32 bars.
2. Εφαρμόζουμε ένα **πρότυπο δομής** ανά είδος (π.χ. το drop ξεκινά μετά το breakdown, γύρω στο 50–60% του track).
3. Επιλέγουμε τμήμα ανάλογα με το **στυλ του set**:
   - *Full*: όλο το track
   - *Club*: ~3–4 λεπτά (groove + drop)
   - *Fast*: ~2 λεπτά (μόνο το drop)
4. Start και end πέφτουν **πάντα σε αρχή φράσης**, για να μην κόβεται η μουσική στη μέση.
5. **Cue editor:** ο χρήστης μετακινεί το σημείο ±1 φράση ενώ ακούει. Η διόρθωση αποθηκεύεται και χρησιμοποιείται ξανά.

---

## 4. Πώς φτιάχνουμε τη σειρά (ordering)

Κάθε μετάβαση A → B παίρνει ένα **κόστος**. Μικρό κόστος = καλή μετάβαση.

- **BPM:** διαφορά έως ~6% → ΟΚ (ή διπλάσιο/μισό).
- **Key:** χρησιμοποιούμε τον τροχό **Camelot** (π.χ. 8A). Ίδιο, ±1, ή A↔B → συμβατό.
- **Energy:** να ακολουθεί την **καμπύλη της διάθεσης**.

Καμπύλες διάθεσης (presets): *Warm-up*, *Peak time*, *Deep / chill*, *Journey* (ανεβαίνει → κορυφώνεται → πέφτει).

Λύση: greedy αρχική σειρά + βελτίωση (2-opt). Γρήγορο για 20–100 tracks, τρέχει στον browser.

---

## 5. Αρχιτεκτονική

```
[Browser — GitHub Pages]
  React + TypeScript + Vite
  ├─ Login Spotify (PKCE, χωρίς server)
  ├─ Web Playback SDK (αναπαραγωγή, seek, volume)
  ├─ Mix engine (ordering + cues) — καθαρή TypeScript
  └─ UI: Create / Mix / Create+Mix, set timeline, cue editor
            │
            ▼
[Cloudflare Worker — δωρεάν]
  ├─ Proxy για Claude API (κρύβει το API key)
  ├─ Proxy για ReccoBeats / Deezer (CORS)
  └─ Cache δεδομένων tracks (KV / D1)
```

Γιατί Worker: το GitHub Pages είναι μόνο στατικό. Δεν μπορεί να κρατήσει μυστικά keys.

**Prompt → playlist (A):**
1. Το Claude μετατρέπει το prompt σε «προδιαγραφή set» (διάθεση, BPM range, διάρκεια, καλλιτέχνες αναφοράς).
2. Προτείνει υποψήφια tracks.
3. Τα βρίσκουμε στο Spotify μέσω search (ελέγχουμε ότι υπάρχουν, γιατί το AI μπορεί να «εφεύρει» tracks).
4. Συμπληρώνουμε από τα top / saved tracks του χρήστη.
5. Φιλτράρουμε με BPM/energy, γεμίζουμε τη ζητούμενη διάρκεια, δημιουργούμε την playlist.

---

## 6. Φάσεις υλοποίησης

| Φάση | Τι κάνουμε | Παραδοτέο |
|---|---|---|
| **0. Spike** | Spotify app, login, play + seek + fade μέσω SDK. Έλεγχος κάλυψης ReccoBeats/Deezer σε ~50 techno tracks. | **Go / no-go.** Ξέρουμε ότι δουλεύει πριν χτίσουμε. |
| **1. Mix playlist (B)** | Φόρτωση δικής σου playlist, δεδομένα tracks, ordering, cues, αναπαραγωγή set. | Πρώτο set που ακούγεται. |
| **2. Prompt (A, C)** | Worker + Claude, prompt → playlist → mix. | Πλήρεις λειτουργίες A/B/C. |
| **3. Ποιότητα** | Cue editor, presets διάθεσης, επιλογή διάρκειας set, αποθήκευση sets. | Χρηστικό app. |
| **4. Νέα είδη** | «Προφίλ είδους»: μήκος φράσης, ανοχή BPM, πρότυπο δομής (π.χ. drum & bass, deep house, melodic techno). | Επέκταση με config, όχι νέο κώδικα. |
| **5. (Προαιρετικό)** | Δικά σου αρχεία ήχου: πραγματική ανάλυση (Essentia.js), beatmatching, crossfade με Web Audio API. | Αληθινό DJ mix, χωρίς περιορισμούς Spotify. |

**Testing:** Η λογική (ordering, cues, Camelot) είναι καθαρές συναρτήσεις → unit tests με Vitest από την αρχή.

---

## 7. Αποφάσεις που χρειάζομαι από σένα

1. **Αποδέχεσαι τον περιορισμό;** Προσωπική χρήση (≤5 χρήστες, Premium), μεταβάσεις fade χωρίς επικάλυψη.
2. **Claude API:** μέσω Worker με δικό σου key (προτείνω) ή κάθε χρήστης βάζει το δικό του;
3. **Stack:** React + TypeScript + Vite + Cloudflare Worker — ΟΚ;

---

## Πηγές

- [Spotify — February 2026 Dev Mode Migration Guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)
- [Spotify — Update on Developer Access (Feb 2026)](https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security)
- [Spotify — Web API quota updates (Jul 2026)](https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates)
- [Spotify Developer Policy](https://developer.spotify.com/policy/)
- [ReccoBeats docs](https://reccobeats.com/docs/documentation/introduction)
