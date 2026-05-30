# Familje-Stunden — Månadspaket: Specifikation & Plan

> **Referensdokument** — alltid gällande. Uppdateras vid förändringar i planen.
> Senast uppdaterad: Maj 2026

---

## 🎯 Mål

Skapa kompletta premium-månadspaket för Familje-Stunden som levereras på **två sätt**:
1. **Strukturerat innehåll till Familje-Stunden-sajten** — data i rätt format för hemsidans mallar
2. **Komplett PDF per månad** — utskriftsklar, redo att säljas/distribueras direkt

Paketen ska kännas som en sammanhängande produktserie. Varje månad har ett tydligt tema, en röd tråd, samma visuella språk och samma mjuka, trygga och magiska känsla.

---

## 🎨 Stil & Känsla

- **Varm, barnvänlig och premium**
- **Modern Pixar/DreamWorks-inspirerad** — mjuk färgpalett, hög kvalitet
- **Lättläst för barnfamiljer** — tydlig typografi, mysig känsla
- **Professionell nog att säljas** som premiumprodukt
- Ingen generisk clipart-känsla
- Inga överdrivet stökiga layouter

### Karaktärer (alltid med)

#### Nova
- **Utseende**: Glad flicka med brunt hår i hästsvans och rosa pannband, varm hudton, uttrycksfull och nyfiken
- **Personlighet**: Nyfiken, varm och modig — hon leder äventyret
- **Kläder**: INTE alltid rymddräkt — kläder anpassas till temat och aktiviteten (t.ex. labbrock i april, vinterjacka i december, sommardress i juli, osv). Referensbilder finns i `familje-stunden-v2/public/images/nova_clean.png` och `nova-winter.png`
- **Konsistens**: Alltid samma ansikte, hår och pannband — bara kläderna varierar

#### Pling
- **Utseende**: Liten blå/teal rund robot med stort glatt leende, rundad kropp, vänliga ögon
- **Personlighet**: Hjärtevarm, lite klumpig och humoristisk — kommunicerar med "Blipp blipp!"
- **Kläder/accessoarer**: Kan ha passande accessoarer till temat (labbrock, halsduk, etc.)
- **Referensbild**: `familje-stunden-v2/src/assets/april-nova-pling-lab.png`

### Färgpalett
Varje månad har **sin egen färgkänsla** kopplad till temat, men håller premiumkänslan.

---

## 📦 Månadsstruktur — 9 obligatoriska delar (i denna ordning)

### 1. 🖼️ OMSLAGSSIDA
Premium omslagsbild (genereras med GPT Image 1):
- Månadens namn + tema
- Nova och Pling i centrum, klädd för temat
- Miljöer och detaljer kopplade till temat
- Stor, tydlig och magisk titel
- Familje-Stunden-logotyp
- Känsla: framsidan på en riktig premium barnbok

### 2. 📋 INNEHÅLLSSIDA
Visuell innehållssida med allt som ingår:
- Små illustrationer/ikoner per del
- Månadstemats färger
- Lätt att förstå för barn och föräldrar

### 3. 📖 SAGA-SIDA *(direkt efter innehåll, före aktiviteterna)*
Layoutsida för månadens saga:
- Stor illustration från sagan
- Kort introduktionstext (lockar till sagostund)
- Två tydliga knappar/element: "📖 Läs sagan" och "🎧 Lyssna på sagan"
- Magisk design

**Bildsagans struktur** (separata sidor/filer):
- **Omslagsbild till sagan** — 1 helbild, titel + Nova & Pling, känsla av bokframsida
- **16 sagosidor** — varje sida har:
  - 1 stor illustration som täcker nästan hela sidan
  - En konsekvent designad textruta längst ner på varje sida (samma form/stil på alla 16 sidor)
  - 1–2 meningar text i rutan, anpassade till illustrationen
- **Baksida** — avslutning som en riktig bokbaksida: sensmoralen, kanske en liten bild, "Slut på äventyret"-känsla
- **Total**: 1 omslag + 16 sidor + 1 baksida = 18 element

**MP3-manus** (separat textfil):
- Berättarröst, naturligt talspråk, ~4 min
- Markeringar: `[PAUS]` `[LUGNT]` `[GLAD]`
- Öppning: "Hej allihopa! Sätt er bekvämt — det är dags för en ny Nova & Pling-saga!"
- Avslutning: "Tack för att ni lyssnade! Vi ses nästa månad!"

### 4. 🎯 FEM AKTIVITETER
5 aktiviteter som passar månadens tema. Varje aktivitet innehåller:
- Titel (kopplad till temat och Nova & Pling-världen)
- Kort introduktion
- Steg-för-steg-instruktioner (numrerade)
- Materiallista (hemma-material, inga specialinköp)
- Pedagogiskt syfte
- Tid och åldersangivelse (3–8 år)

Variation mellan: pyssel · lärande · rörelse · upptäckande · fantasi · natur · samtal · kreativitet

### 5. 🎨 FEM FÄRGLÄGGNINGSBILDER
5 unika svartvita färgläggningsbilder:
- Enkel och tydlig linjekonst (no shading, white background)
- Nova klädd för temat (ej alltid rymddräkt) och/eller Pling
- Fungerar bra för utskrift (printable quality)
- Variation: Nova ensam · Pling ensam · båda · temamiljö · objekt/detalj

### 6. ✂️ KLIPP & KLISTRA / PYSSEL
1 större pysselaktivitet per månad. Exempel:
- Klipp ut och bygg
- Matchningskort
- Figurer/masker/dekorationer
- Minispel
- Vikbara delar

Ska vara: lätt att förstå · roligt att göra tillsammans · tydligt visuellt

### 7. ☑️ CHECKLISTA
Mysig checklistesida där barnen kan kryssa av:
- Alla 5 aktiviteter
- Sagan (läst/lyssnat)
- Pysslet
- Färgläggningsbilderna (alla 5)
- Diplom (uppnådd!)

Känsla: motiverande och lekfull, inte en trist lista

### 8. 🏆 DIPLOM
Diplom som barnen får efter månaden:
- Fint och stolt utseende med Nova och Pling
- **Barnets namn**: en rad uppe i mitten (ifyllbar)
- **Datum**: en rad nere till vänster (ifyllbar)
- **Signatur**: "Nova & Pling" nere till höger i en font som liknar barnhandstil
- Månadens tema och titel
- Känsla: en riktig prestation och belöning

### 9. 🌟 AVSLUTNINGSSIDA
Varm och mysig avslutningssida:
- Tackar familjen för månaden
- Nova och Pling (klädda för temat)
- Teasar nästa månad (bygger förväntan)
- Känsla: emotionell, trygg och framåtblickande

---

## 📅 Månader att skapa

| Månad     | Tema                        | Status     |
|-----------|-----------------------------|------------|
| Januari   | (befintlig)                 | ✅ Klar    |
| Februari  | (befintlig)                 | ✅ Klar    |
| Mars      | (befintlig)                 | ✅ Klar    |
| April     | (befintlig)                 | ✅ Klar    |
| Maj       | (befintlig)                 | ✅ Klar    |
| Juni      | (befintlig)                 | ✅ Klar    |
| **Juli**  | **Sagosommar**              | 🔄 Pågår  |
| **Augusti** | **Skolstart & Bokstavsäventyr** | 🔄 Pågår |
| **September** | **Skördemånaden**       | 📋 Planerad |
| **Oktober** | **Rymdmånaden**           | 📋 Planerad |
| **November** | **Löv & Skuggmånaden**  | 📋 Planerad |
| **December** | **Julmånaden**           | 📋 Planerad |

> Alltid följa befintliga månaders (Januari–Juni) struktur, tonalitet och kvalitet som referens.

---

## 🤖 AI-workflow (AI Ops Platform)

### Nova — prompt-referens för bildgenerering
> Nova är en glad flicka med brunt hår i hästsvans, rosa pannband, varm hudton och uttrycksfull mimik. Kläderna varierar med temat — t.ex. sommardress i juli, labbrock i april, vinterjacka i december. Hon bär INTE alltid rymddräkt eller hjälm. Alltid samma ansikte och hår.

### Pling — prompt-referens för bildgenerering
> Pling är en liten blå/teal rundad robot med stort glatt leende, liten kropp och vänliga ögon. Kan bära temarelaterade accessoarer (halsduk, labbrock, etc.).

### Nuvarande pipeline (uppdateras)
```
1. Tema-arkitekt       → tema (kort, fokuserat, < 300 ord)
2. Aktivitets-skapare  → 5 aktiviteter + 1 klipp&klistra + checklista-items + diplom-text + avslutningssida-text
3. Saga-berättare      → 16 sagosidor (1-2 meningar/sida) + omslagsbeskrivning + baksida + mp3-manus
4. Bildprompt-designer → 5 färgläggningsprompts (Nova i temakläder) + omslagsprompt
5. DALL-E Bildgenerator → 5 färgläggningsbilder + omslagsbild
```

### Kommande steg
```
6. Innehåll-packager → strukturerad data för Familje-Stunden-sajten
7. PDF-generator → komplett utskriftsklar PDF (alla 9 delar)
```

### Leveransformat
- **Sajten**: Strukturerad JSON/TypeScript-data som matchar befintliga månadsmallar
- **PDF**: Komplett fil med alla 9 sidor, premiumlayout, barnvänlig typografi

---

## 📐 Teknisk plan

### Fas 1 — Innehåll (nu)
- [x] Tema (kortfattat, < 300 ord)
- [x] Aktiviteter (5 st med tid/ålder/material/steg)
- [x] Saga (nuvarande format, uppdateras nedan)
- [x] 4 färgläggningsbilder
- [ ] Saga: uppdatera till 16 sidor (1-2 meningar/sida) + omslag + baksida + mp3-manus
- [ ] Utöka till 5 färgläggningsbilder (Nova i temakläder, ej alltid rymddräkt)
- [ ] Klipp & Klistra-agent (1 stor pysselaktivitet)
- [ ] Checklista-items (alla 5 aktiviteter + saga + pyssel + 5 bilder + diplom)
- [ ] Diplom-text (namn uppe i mitten, datum nere vänster, "Nova & Pling"-signatur nere höger)
- [ ] Avslutningssida-text (tack + tease nästa månad)
- [ ] Omslagsbild (GPT Image 1, Pixar-stil, Nova i temakläder)

### Fas 2 — PDF-export
- [ ] HTML-mall per del (React/Tailwind)
- [ ] PDF-renderer (Puppeteer/Playwright)
- [ ] Samanfoga alla 9 delar till en fil
- [ ] Namnge: `familje-stunden-[manad]-2026.pdf`

### Fas 3 — Sajt-integration
- [ ] Exportformat matchar Familje-Stunden-datans TypeScript-struktur
- [ ] Automatisk uppladdning till rätt månadsplats
- [ ] Låst t.o.m. den 1:a aktuell månad

---

## ✅ Regler att alltid följa

1. **Allt material nytt och unikt** per månad
2. **Tema-specifik färgkänsla** — varje månad har sin identitet
3. **Nova & Pling alltid med** — konsekventa karaktärer
4. **Hemma-vänliga aktiviteter** — inga specialinköp
5. **Barn 3–8 år** — enkelt, tydligt, lekfullt
6. **All text på svenska**
7. **Printfriendly** — fungerar som PDF
8. **Inte låsa upp** nytt månadspaket förrän den 1:a aktuell månad
9. **Automationsschema** sätts upp EFTER att materialet fungerar bra
10. **Referera alltid till Januari–Juni** som kvalitetsmåttstock

---

## 🚫 Undvik

- Generisk clipart-känsla
- Stökiga layouter
- Engelska ord i materialet
- Aktiviteter som kräver specialmaterial
- Att publicera/låsa upp månader för tidigt
- Att automatisera innan manuell kvalitetsgranskning är gjord
