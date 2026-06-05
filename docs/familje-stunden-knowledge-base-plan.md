# Familje-Stunden Knowledge Base — Inventering & Strukturförslag

**Status:** Inventering + plan. INGA filer flyttas/kopieras förrän du godkänt.
**Princip:** Familje-Stunden hålls 100% åtskilt från The Prompt — eget innehåll, egna karaktärer, egen bildstil, eget varumärke.

---

## 1. Lokal inventering (ansluten mapp = kodrepot)

Den anslutna mappen är **kodrepot**, inte ett innehållsbibliotek. Familje-relaterat lokalt:
- `FAMILJE_STUNDEN_SPEC.md`, `FAMILJE_STRIPE_INTELLIGENCE_OCH_GROWTH_PLAN.md` — specdokument.
- `apps/web/scripts/seed-familje-stunden.ts` — definierar AI-agentroller (Tema-arkitekt, Aktivitets-skapare, Saga-berättare, Bildprompt-designer) men **inget faktiskt innehåll**.
- `brand/assets/` — **Omnira**-logotyper (generiska), INTE Familje-Stundens varumärke.
- `apps/remotion/tmp-images/scene-*.png` — **The Prompts** render-scratch. ⚠️ Får aldrig användas för Familje.

**Slutsats:** det finns **inget Familje-content lokalt i repot**. Det riktiga biblioteket ligger i **Google Drive**.

---

## 2. Google Drive-inventering (läst, inget importerat)

Substantiellt material hittat. Nyckel-**mappar** (att gå igenom rekursivt vid godkännande):

| Mapp | Drive-ID | Innehåll (översikt) |
|------|----------|---------------------|
| Familje-Stunden | `1znd_nxSAascrlNCa38jNspGJTPZ4gZZ_` | checklistor, kärnmaterial |
| Familje-Stunden PDF | `12TuxZ5353575c6REfeVY7W7BYEfUHavv` | tidslinjer, lanseringsdok |
| Lanseringspaket | `1bkY-TCl3ZGllI_qfnRaKAMSzyny9wmnW` | marknadsföring/affär (pitch, mediakit, e-postflöden …) |

**Identifierade kategorier (representativa filer — listan är partiell, fler sidor finns):**

- **Sagor:** `Rymdmånaden.pdf` (16 MB), `Skördemånadens saga (Tryckklar) N.1.pdf` (10 MB), `Sagan Juli månad.pdf` (15 MB), `Kopia av Känslomånaden_med_sista_sida.pdf` (28 MB), `En känsla i magen1 (EPUB).epub` (32 MB), `Familje Stunden Mall.pdf`.
- **Omslag:** `Sagomånaden Juli Omslagsbild.pdf` (3,5 MB).
- **Referens-/karaktärsbilder:** `Sagokarta_A4_FamiljeStunden.png` (3,4 MB).
- **Mallar:** `Familje-Stunden_Temamall_GoogleSheets.xlsx`.
- **Sociala medier / marknadsföring:** `MediaKit_FamiljeStunden.pdf`, `Pitch_FamiljeStunden_SV.pdf`, `Influencerpitch_FamiljeStunden.pdf`, `Epostflode_FamiljeStunden.pdf`, `Samarbetsblad_Forskolor_FamiljeStunden.pdf`, `Produktbeskrivningar_FamiljeStunden.pdf`, `Kundnytta_FamiljeStunden.pdf`.
- **Affär (referens, ej AI-generering):** `Affarsplan_FamiljeStunden_AB.pdf`, `Budget_och_Lanseringsplan_FamiljeStunden_KORR.pdf`, `Villkor_och_Integritet_FamiljeStunden.pdf`.
- **Varumärke/manifest:** `Meningen med familje-stunden.txt`, `README.pdf`.
- **Kod/app (ej KB):** `familje-stunden-magi-main.zip` (4,9 MB, webb/app-export), `FamiljeStunden_Lanseringspaket.zip`.

⚠️ **Detta är en partiell skanning** (Drive returnerade fler sidor). Aktivitetsmaterial, färgläggningssidor och fler månadssagor/karaktärsbilder finns sannolikt djupare i mapparna — fångas i den fullständiga rekursiva genomgången.

---

## 3. Föreslagen struktur: `content/familje-stunden/`

```
content/familje-stunden/
  brand/              # varumärkesregler, färger, typsnitt, logotyper, "meningen med"
    style-guide/
    logos/
  characters/         # karaktärsbilder + karaktärsbeskrivningar (kanon)
  stories/            # sagor per månadstema
    rymdmanaden/
    skordemanaden/
    kanslomanaden/
    juli-sagomanaden/
  covers/             # omslagsbilder per månad
  activities/         # aktiviteter, pyssel, färgläggningssidor
  templates/          # tema-/sagomallar
  reference/          # bildstil-referenser (t.ex. sagokarta)
  social/             # mediakit, pitch, influencer, e-postflöden
  business/           # affärsplan, budget, villkor (referens, ej generering)
  _meta/              # KB-index + varumärkesregler i maskinläsbar form (JSON/MD)
```

`_meta/brand-rules.md` + `_meta/index.json` blir det Atlas/Marketing Engine läser för att hålla karaktärer, bildstil och ton konsekventa.

---

## 4. Föreslagen fil → mapp-mappning (att kopiera vid godkännande)

| Drive-fil | → Mål |
|-----------|-------|
| Rymdmånaden / Skördemånaden / Sagan Juli / Känslomånaden / En känsla i magen | `stories/<månad>/` |
| Sagomånaden Juli Omslagsbild.pdf | `covers/` |
| Sagokarta_A4_FamiljeStunden.png | `reference/` |
| Familje-Stunden_Temamall.xlsx, Familje Stunden Mall.pdf | `templates/` |
| MediaKit / Pitch / Influencerpitch / Epostflode / Samarbetsblad / Produktbeskrivningar / Kundnytta | `social/` |
| Affarsplan / Budget / Villkor | `business/` |
| Meningen med familje-stunden.txt, README.pdf (kanonisk) | `brand/` |

(Karaktärsbilder, färgläggningssidor och aktivitetsmaterial mappas när den rekursiva genomgången hittat dem.)

---

## 5. Dubbletter & gamla versioner (exkluderas / dedupliceras)

- `README.pdf` — **4 identiska kopior** (235 109 bytes) → behåll 1.
- `Tidslinje_Aug_Sept_Lansering_FamiljeStunden.pdf` — **2 kopior** → behåll 1.
- `Meningen med familje-stunden.txt` — **2 kopior** (2 836 bytes) → behåll 1.
- `Offertspecifikation_Familje-Stunden_kopia.pdf` — markerad "kopia".
- `Kopia av Känslomånaden_med_sista_sida.pdf` — markerad "Kopia av" → verifiera mot original innan val.
- `*.zip` (magi-main, Lanseringspaket) — kod/paket, hör inte hemma i KB.

---

## 6. Viktig övervägning innan import: var lagras filerna?

Sagorna/omslagen är **stora binärer** (PDF upp till 28 MB, EPUB 32 MB). Att lägga dem i git-repot sväller historiken. Förslag:
- **Text + varumärkesregler + index** (`brand/`, `_meta/`, beskrivningar) → i git (lätt, versionshanterat).
- **Tunga media** (sagor, omslag, bilder) → Supabase Storage eller en gitignorerad `content/`-mapp, refererade från `_meta/index.json`.

Det håller repot lätt men ger Atlas/Marketing Engine en enda källa att slå upp.

---

## Nästa steg (din beslutspunkt)

Inget kopieras förrän du säger till. När du godkänner gör jag:
1. **Fullständig rekursiv inventering** av de tre Drive-mapparna → exakt fil-för-fil-manifest (inkl. karaktärsbilder/aktiviteter som inte syns på första sidan).
2. Bekräftar dedupe-besluten med dig.
3. Skapar mappstrukturen + importerar godkända filer till vald lagring (git för text, Storage för media).
4. Bygger `_meta/brand-rules.md` + `index.json` som Marketing Engine sedan använder.

Vill du att jag kör den fullständiga rekursiva inventeringen av de tre mapparna nu (fortfarande utan att kopiera något), så får du det exakta manifestet innan vi rör en enda fil?
