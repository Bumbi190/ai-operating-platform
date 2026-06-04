# Familje-Stunden — Landningssida: Konverteringsplan v1 (5 förbättringar)

**Status:** Implementationsplan. **Ingen kod skriven.** Enbart konverteringsförbättringar på den publika
landningssidan `familje-stunden.se/` (utloggad vy). Grundad i en faktisk granskning av live-sidan.
⛔ Inga nya features, ingen marknadsautomation, ingen publicering, ingen Pinterest/e-post.

> **Obs om kodbas:** landningssidan/medlemsportalen (familje-stunden.se) är produktsajten — separat från
> Omnira/Marketing Engine-repot. Planen beskrivs på UI-/copy-nivå med komplexitetsuppskattningar för en typisk
> React/Next-SPA. Exakta filer bekräftas i den repo:n innan bygge.

## ⚠️ Måste verifieras innan copy publiceras (hitta inte på)
1. **Exakta trial-villkor i Stripe:** är det 3 månader helt gratis? Krävs kort vid start? Vad händer efter
   (59 kr/mån, ingen bindningstid)? All trial-copy nedan måste matcha den verkliga Stripe-konfigurationen.
2. **Verkligt antal familjer:** Stripe visar i nuläget ~5 aktiva + 3 trial. "500+ familjer" kan inte påstås
   utan stöd (se förbättring 5).

---

## Förbättring 1 — Gör "Prova gratis i 3 månader" till primär CTA överallt
**Varför det spelar roll:** Den starkaste konverteringshävstången (3 månader gratis) finns idag bara i
nav-knappen. Hjälten och prisboxen säger "Starta din prenumeration" (åtagande) — det höjer den upplevda risken
i exakt det ögonblick besökaren ska agera. Att leda med det riskfria provet sänker tröskeln mest.

**Förväntad konverteringsimpact:** Hög — typiskt **+20–40 % fler trial-starts** när hjälte-CTA byts från
"köp/prenumerera" till "prova gratis".

**Exakta UI-ändringar:**
- Hjälte-CTA (primärknapp): byt text + handling till gratis-provet.
- Prisbox-CTA: samma byte.
- Nav-CTA: behåll (redan rätt), men matcha exakt ordval (se förbättring 2).
- Lägg en mikro-rad direkt under hjälte-CTA med villkoren (ingen bindningstid, avsluta när du vill).

**Rekommenderad copy:**
- Knapp: **"Prova gratis i 3 månader"**
- Mikrorad under: *"Ingen bindningstid • Avsluta när du vill"* (finns redan — behåll under den nya knappen)
- Sekundär länk (behåll): *"Har du redan ett konto? Logga in"*

**Komplexitet:** Låg (text + ev. länkmål till signup-flödet; ingen ny logik).

---

## Förbättring 2 — Enhetligt CTA-språk på hela sidan
**Varför det spelar roll:** Idag konkurrerar två budskap: nav "Prova gratis i 3 månader" vs hjälte/pris "Starta
din prenumeration". Olika ord för samma handling skapar tvekan och splittrar fokus. En enda, upprepad primär
handling läser tydligare och bygger igenkänning ner genom sidan.

**Förväntad konverteringsimpact:** Hög (additiv till #1) — **+10–15 %** av minskad förvirring/beslutsfriktion.

**Exakta UI-ändringar:**
- Inventera ALLA CTA-instanser (nav, hjälte, prisbox, ev. mellansektioner) → samma text, samma stil, samma mål.
- En primär stil (rosa/gradient-knapp) för "Prova gratis"; sekundär stil (länk) för "Logga in".
- Ta bort/dämpa konkurrerande formuleringar ("Starta din prenumeration" som primär).

**Rekommenderad copy:** överallt primärt **"Prova gratis i 3 månader"**; vid behov kort variant i nav: **"Prova gratis"**.

**Komplexitet:** Låg (ren text-/stil-städning; gör tillsammans med #1).

---

## Förbättring 3 — Prisboxen förklarar 3-månaderstrialen tydligt
**Varför det spelar roll:** Prisboxen är där beslutet tas. Idag visar den bara "59 kr/månad" utan att rama in det
gratis provet — besökaren ser priset, inte den riskfria starten. Att visa "3 månader gratis, sedan 59 kr/mån"
gör erbjudandet konkret och tryggt precis vid konverteringspunkten.

**Förväntad konverteringsimpact:** Hög — tydlig trial-ram vid priset minskar avhopp i sista steget.

**Exakta UI-ändringar:**
- I prisboxen: lägg en framträdande trial-rad ovanför/runt priset.
- Behåll "🍦 mindre än en glass per vecka" och "ingen bindningstid / inga dolda avgifter".
- Lägg en kort 3-stegs trygghetsrad: *vad händer nu → efter 3 månader → hur du avslutar*.
- CTA i boxen = samma "Prova gratis i 3 månader" (från #1/#2).

**Rekommenderad copy (matcha Stripe-villkoren):**
- Rubrik i box: **"3 månader gratis"**, underrad: *"sedan 59 kr/mån — avsluta när du vill"*
- Trygghetsrad: *"Inga dolda avgifter • Ingen bindningstid • Avsluta när som helst"*
- (Om kort krävs:) *"Vi påminner innan provperioden tar slut"* — endast om det stämmer.

**Komplexitet:** Låg–medel (layout i prisboxen + säkerställ att copy speglar Stripe).

---

## Förbättring 4 — Gratis smakprov (förhandsvisning av saga/aktivitet)
**Varför det spelar roll:** Idag är allt innehåll låst ("Logga in för att se allt 🔓"). Föräldrar kan inte
bedöma kvaliteten innan de registrerar sig — en stor förtroende-/köptröskel. Ett fritt smakprov låter dem
uppleva Nova & Pling-kvaliteten direkt, vilket bygger förtroende och driver trial-start.

**Förväntad konverteringsimpact:** Hög på sikt (sänker köp-tröskeln; "se innan du provar"). Tydligt lägre
avhopp i innehålls-sektionen.

**Exakta UI-ändringar:**
- Ersätt/komplettera "Logga in för att se allt"-låset med en **öppen smakprovs-modul**:
  - En läsbar exempel-saga (kort) ELLER en nedladdningsbar exempel-pyssel-PDF, ELLER en kort uppspelbar ljudsaga-snutt.
  - Tydlig "Smakprov"-märkning så det inte förväxlas med fullt innehåll.
- CTA efter smakprovet: **"Gillade ni det? Prova gratis i 3 månader"**.
- Använd ETT befintligt, godkänt kanon-innehåll (ingen ny produktion) — t.ex. en redan publicerad saga/pyssel.

**Rekommenderad copy:**
- Sektionstitel: **"Smaka på en familjestund — gratis"**
- Underrad: *"Läs en exempel-saga och prova ett pyssel innan du bestämmer dig."*

**Komplexitet:** Medel–hög (kräver att välja + exponera ett befintligt innehåll publikt + ev. enkel
PDF-/läsvy). Mest arbete av de fem; ingen ny innehållsproduktion behövs.

---

## Förbättring 5 — Ersätt eller ta bort "500+ familjer" om det inte kan styrkas
**Varför det spelar roll:** Sidan påstår "500+ familjer myser redan", men Stripe visar ~5 aktiva + 3 trial. Ett
ostyrkt/överdrivet påstående är en trovärdighets- och ärlighetsrisk (samma princip som Brand Guards
falskt-påstående-regel). Bättre med inget än osant — förtroende är hela värdeerbjudandet.

**Förväntad konverteringsimpact:** Neutral–positiv på kort sikt (tar bort ett falskt löfte), **skyddar
förtroende/varumärke** på lång sikt (undviker bakslag om siffran ifrågasätts).

**Exakta UI-ändringar:**
- I hjälte-statistiken och "500+ familjer myser redan"-raden: ta bort siffran ELLER byt till en sann formulering.
- Behåll "12 månadsteman" och "60+ aktiviteter" (sanna, produktbaserade).
- Ersätt social-proof-luckan med något verkligt: testimonials (finns), eller "Ett växande community".

**Rekommenderad copy (välj efter vad som är sant):**
- Om verkligt litet: ta bort siffran; behåll *"Familjer myser med Nova & Pling"* utan antal.
- Om/ när siffran stämmer: använd den exakta verifierade siffran.
- Neutralt alternativ: *"Ett växande community av familjer"*.

**Komplexitet:** Låg (text-ändring; kräver ett beslut om vad som är sant).

---

## Rekommenderad ordning (impact ÷ ansträngning)
1. **Förbättring 1** — hjälte/pris-CTA → gratis-provet. Störst hävstång, låg ansträngning.
2. **Förbättring 2** — enhetligt CTA-språk (gör i samma pass som #1).
3. **Förbättring 3** — prisboxens trial-förklaring. Hög impact vid beslutspunkten, låg–medel ansträngning.
4. **Förbättring 5** — fixa "500+"-påståendet. Snabb, skyddar trovärdighet; gör tidigt parallellt.
5. **Förbättring 4** — gratis smakprov. Störst arbete, gör sist som eget steg.

> Sammanfattning: #1–#3 + #5 är låg ansträngning / hög effekt och kan göras i ett första pass; #4 är ett separat,
> något större steg. Alla copy-rader ovan måste bekräftas mot verkliga Stripe-villkor och verkligt familjeantal
> innan publicering — inga påhittade siffror eller löften.
