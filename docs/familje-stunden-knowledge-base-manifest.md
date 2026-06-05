# Familje-Stunden Knowledge Base — Komplett manifest & kanon

**Status:** Inventering klar. INGEN kopiering/migrering förrän du godkänt.
**Källa:** Google Drive (ägare andrehultgren190@gmail.com). The Prompt berörs ej.

> Viktigt: Drive-roten innehåller även massor av **icke-Familje-material** (CV:n, kontoutdrag, andra projekt). Familje-universat ligger i mappen **"Familje-Stunden"** + undermappar, plus några lösa månads-PDF:er i roten. Bara Familje-material tas med nedan.

---

## 1. Identifierad KANON (sanningskälla för framtida AI)

### Karaktärer
- **Nova & Pling** — de återkommande huvudkaraktärerna. En **rymdkapten-duo** som reser genom universum.
- **Relation:** ständiga följeslagare/vänner som upptäcker världen *tillsammans* med barnet. De har en "kometvän" (återkommande bielement).
- **Kanoniska karaktärsbilder (transparent bakgrund):** `Nova Vanlig Utan bakgrund.png`, `Nova utan bakgrund.png`, `Pling vanlig utan bakgrund.png`, `Pling utan bakgrund.png` (mapp "Nova och Pling Utan bakgrund") + mapp "Blandade bilder Nova och Pling" (fler poser/scener).

### Värld / koncept
- En **galaktisk ram**: Nova & Pling "landar" varje månad i ett nytt **jord-tema** och utforskar det pedagogiskt (årstider, natur, känslor, rymd, bokstäver…). Rymd-metaforer genomgående ("galaxen", "dockningsporten", "kometvän").
- **Format:** ett **månadsäventyr** levererat som pärm/PDF (framtida fysisk box), med diplom per månad → bygger barnets självförtroende + nyfikenhet, ger föräldrar kvalitetstid. Ritual: "ska vi öppna månadens äventyr tillsammans?"

### De 12 månadstemana (kanon, ur `Teman.txt`)
| Månad | Tema |
|-------|------|
| Januari | Vinterexpedition ❄️ |
| Februari | Kärleksmånad ❤️ |
| Mars | Vårens första steg 🌱 |
| April | Experimentmånad 🧪 |
| Maj | Blomsteräventyr 🌸 |
| Juni | (verifieras i mappen) |
| Juli | Sagosommar 📖 |
| Augusti | Skolstart & Bokstavsäventyr |
| September | Skördemånaden 🍂 |
| Oktober | Löv- & skuggmånaden |
| November | Rymdmånaden 🚀 |
| December | Julmånaden (kommer) |

### Berättarstil & varumärkeston
- Varm, uppmuntrande, magisk, barnnära. Standardöppning: *"Följ med Nova & Pling när de…"*.
- Pedagogiskt + lekfullt, svenska, konkreta gör-själv-aktiviteter per tema.
- Marknadsföring: emoji-rik, familjekänsla, ritual/minnen.

### Bildstil & färgpalett
- Mjuk, barnvänlig illustration; rymd/galax-motiv; Nova & Pling som genomgående figurer.
- **Exakt färgpalett (hex) finns inte som textdokument** — den måste extraheras ur de kanoniska karaktärs-PNG:erna + omslagen vid import (jag gissar inga värden). Det blir ett steg när vi bygger `_meta/brand-rules.md`.

### Per-månad paketstruktur (kanon, ur Känslomånaden-paketet)
Varje månad levereras som ett paket: **Saga** (PDF), **Klipp och klistra**, **Diplom**, **Färgläggning**, **Klistermärken**, **broschyr**, **EPUB**, **Tryckt version**, samt **ljudsaga** (mapp "Sagor Ljud").

---

## 2. Filmanifest (Familje-material)

### A. Karaktärer (→ Storage: `characters/`)
- Mapp **"Nova och Pling Utan bakgrund"** (`1aUs4w7…`): 4 transparenta PNG (Nova ×2, Pling ×2).
- Mapp **"Blandade bilder Nova och Pling"** (`1tPVFx…`): fler karaktärsbilder (enumereras vid import).

### B. Teman & månadspaket (→ Storage: `stories/<månad>/`, `activities/`, `covers/`)
- Mapp **"Tema 12 Månader"** (`1VhU4v…`) med undermappar: **Januari** (`1lhPCQ…`), **Sagosommar Juli** (`1o0lK6…`), **September Skördemånaden** (`1K7yQZ…`), **Prov Månad-Rymdmånaden** (`1Xt9im…`) + `Teman.txt` + `Familje-Stunden_Temamall.xlsx`.
- Mapp **"Redo för tryckeri och lansering"** (`11avZ…`): tryckklara månadspaket.
- **Känslomånaden-paket** (i roten, kompletta filer): `Känslomånaden.pdf` (saga, 35 MB), `Färgläggning Känslomånaden.pdf`, `Klipp och klistra…`, `Diplom…`, `Klistermärken… (färdiga)`, `broschyr…`, `En känsla i magen (Tryckt).pdf`, `En känsla i magen1 (EPUB).epub`.
- **Lösa månads-sagor (root):** `Familjestunden_Rymdmånaden_FINAL_KORREKT_ORDNING.pdf`, `Augusti, Skolstart & Bokstavsäventyr (1).pdf`, `Skördemånadens saga (Tryckklar) N.1.pdf`, `Sagan Juli månad.pdf`, `Rymdmånaden.pdf`, `Sagomånaden Juli Omslagsbild.pdf` (omslag).
- Referensbild: `Sagokarta_A4_FamiljeStunden.png`.

### C. Ljud (→ Storage: `audio/`)
- Mapp **"Sagor Ljud"** (`1wYJK…`): inlästa sagor (MP3, enumereras vid import).

### D. Varumärke / manifest (→ Git: `brand/`, `_meta/`)
- `Meningen med familje-stunden.txt` (varumärkets själ), `Teman.txt` (12 teman), `Ordning på pdfen.txt`, `Familje-Stunden_Checklista.pdf`.

### E. Marknadsföring / sociala medier (→ Storage: `social/`)
- Mapp **"Lanseringspaket"** (`1bkY…`): `MediaKit`, `Pitch_SV`, `Influencerpitch`, `Epostflode`, `Samarbetsblad_Forskolor`, `Produktbeskrivningar`, `Kundnytta`, `Oversikt_Manadsaventyr`, `Lanseringschecklista`, `Utvecklarpaket`.
- Mapp **"Mail"** (`1Y2jF…`) + **"FlödesSchema för mailerlite"**: e-postflöden.

### F. Affär (→ Git eller Storage: `business/`, referens — ej AI-generering)
- `Affarsplan_FamiljeStunden_AB.pdf`, `Budget_och_Lanseringsplan…`, `Villkor_och_Integritet…`.

### EJ del av KB (uteslut)
- `familje-stunden-magi-main.zip`, "Lovable repo", "Google AI Studio"-applet, Shopify/Backup Ekonomi/CV:n/kontoutdrag.

---

## 3. Dubbletter & gamla versioner (dedupliceras)

- **Känslomånaden-paketet** finns i **3 identiska kopior** i roten (batchar 06:17, 07:30, 07:31 — samma filstorlekar). → behåll EN uppsättning.
- `Familjestunden_Rymdmånaden_FINAL_KORREKT_ORDNING.pdf` — **3 identiska** (17 642 964 bytes). → behåll 1.
- `README.pdf` × 4 (235 109 bytes). → behåll 1 (eller uteslut helt).
- `Meningen med familje-stunden.txt` × 2; `Tidslinje_Aug_Sept` × 2. → behåll 1 var.
- Filer märkta "kopia"/"Kopia av" → verifiera mot original.

---

## 4. Rekommenderad Knowledge Base-struktur (`content/familje-stunden/`)

```
content/familje-stunden/
  _meta/                    # GIT — sanningskälla för AI
    brand-rules.md
    characters.md           # Nova & Pling-kanon
    themes.md               # 12 teman
    index.json              # maskinläsbart register (pekar på Storage-URL:er)
  brand/                    # GIT — text/manifest
    meningen.md
    checklista.md
  (media i Supabase Storage, ej git):
    characters/<nova|pling>/*.png
    stories/<månad>/*.pdf|*.epub
    activities/<månad>/*.pdf      # färgläggning, klipp-klistra, diplom, klistermärken
    covers/<månad>/*.pdf|*.png
    audio/<månad>/*.mp3
    social/*.pdf
    business/*.pdf
```

## 5. Vad i git vs Supabase Storage

- **Git (lätt, versionshanterat):** allt under `_meta/` och `brand/` — textkanon, regler, register. Det är detta Marketing Engine/agenter läser.
- **Supabase Storage (tunga binärer):** alla PDF/EPUB/PNG/MP3 (sagor, aktiviteter, omslag, karaktärsbilder, ljud, social, business). `index.json` i git pekar på deras Storage-URL:er.
- Skäl: sagorna är 10–35 MB styck → får inte svälla git-historiken.

---

## 6. Förslag: `_meta/brand-rules.md` (utkast)

```markdown
# Familje-Stunden — Brand & Canon Rules (AI source of truth)
ALDRIG blanda med The Prompt. Eget universum, egna karaktärer, egen stil.

## Karaktärer
- Nova & Pling: rymdkapten-duo, vänner som utforskar världen tillsammans med barnet.
  Använd ALLTID de kanoniska karaktärs-PNG:erna (characters/). Hitta inte på nya karaktärer.
## Värld
- Galaktisk ram: Nova & Pling "landar" i månadens jord-tema och utforskar det pedagogiskt.
## Ton
- Varm, magisk, uppmuntrande, barnnära svenska. Öppning: "Följ med Nova & Pling när de…"
- Pedagogiskt + lekfullt. Konkreta gör-själv-aktiviteter.
## Bildstil
- Mjuk barnvänlig illustration, rymd/galax-motiv. Palett: <extraheras ur karaktärs-PNG + omslag>.
## Format
- Månadsäventyr: saga + färgläggning + klipp-klistra + diplom + klistermärken + ljudsaga.
## 12 teman
- (se themes.md)
```

## 7. Förslag: `_meta/index.json` (utkast-skelett)

```json
{
  "brand": "familje-stunden",
  "characters": [
    { "id": "nova", "art": ["storage://familje-stunden/characters/nova/nova-vanlig.png"] },
    { "id": "pling", "art": ["storage://familje-stunden/characters/pling/pling-vanlig.png"] }
  ],
  "themes": [
    { "month": "januari", "name": "Vinterexpedition", "story": null, "activities": [], "cover": null, "audio": null },
    { "month": "november", "name": "Rymdmånaden", "story": "storage://…/stories/november/rymdmanaden.pdf" }
  ]
}
```
(Fylls i fullständigt vid import, med riktiga Storage-URL:er per fil.)

---

## Nästa beslutspunkt (inget kopieras förrän du godkänt)

1. Godkänn strukturen + git/Storage-uppdelningen ovan.
2. Säg om jag ska skapa en **Supabase Storage-bucket** (`familje-stunden`) för media.
3. Vid godkännande: jag enumererar de återstående bild-/ljudmapparna fil-för-fil, deduplicerar enligt §3, importerar till git (text) + Storage (media), och genererar färdiga `_meta/brand-rules.md` + `characters.md` + `themes.md` + `index.json`.

⚠️ Färgpaletten extraheras ur karaktärs-PNG/omslag i importsteget — jag har inte gissat några värden.
