# Familje-Stunden — Drafter Learning Report v1

**Underlag:** de 8 verkliga juli-utkasten (Sagosommar) som Channel Drafter (Claude `claude-sonnet-4-6`)
genererade i den första riktiga end-to-end-körningen. Läst verbatim ur `draft_posts`. **Ingen copy ändrad.**
Syftet är att lära av faktiskt genererat innehåll och föreslå skärpningar av Drafter-prompten för v2.

**Mål för v2 (viktigt):** inte mer poetiskt språk. **Mer mänskligt, praktiskt, varmt och användbart** för
riktiga föräldrar till barn 3–7 år. Korta ner, konkretisera, variera, fixa buggar.

Drafts i urvalet: 01 IG Reel · 02 FB · 03 IG Karusell · 04 FB · 05 IG Story · 06 FB · 07 IG Reel · 08 FB.

---

## 1. Upprepade hook-mönster
Drafterna konvergerar mot ett fåtal mallar — i en riktig kampanj skulle flödet kännas enformigt.

- **Identisk hook återanvänd:** Draft 01 och Draft 03 har exakt samma hook: *"✨ Vad händer när sanden börjar viska sagor?"*
- **"Tänk dig / Föreställ dig: sandkornen…"-mallen:** Draft 02, 05, 06 (och i anda 08) öppnar med samma sensoriska formel: *"Tänk dig: sandkornen kittlar mellan tårna, havet glittrar…"* / *"Föreställ dig: sanden är varm…"* / *"Tänk dig: sandkornen kittlar tårna, vinden viskar i vassen…"*
- **Återkommande byggstenar i nästan varje hook:** sand mellan tårna · hav/vågor som viskar · ✨-emoji först · em-streck-dramatik.
- **Konsekvens:** 6 av 8 hooks bygger på "strand + sand + viskande hav". Bara Draft 07 ("Sommaren smakar saga") bryter mönstret.

## 2. AI-klingande fraser
Mönster som signalerar genererad text snarare än en människa som pratar med en förälder:

- **Sensoriska klichéer på rad:** "sandkornen kittlar mellan tårna, havet glittrar", "vinden bär på en hemlighet", "vinden viskar i vassen".
- **Överanvändning av "magi/magisk":** förekommer i 7 av 8 drafts, ofta flera gånger ("magiskt låg gömt", "fylld av magi", "en magisk kväll att minnas").
- **Em-streck-dramaturgi:** tunga "—"-pauser i nästan varje mening (t.ex. Draft 06 har 4 st).
- **Abstrakt svulst före nytta:** flera drafts ägnar 2 stycken åt stämning innan de säger vad man faktiskt får.
- **Värst:** Draft 02 och 06 (mest utfyllda). Draft 06 är längst (837 tecken) och mest överarbetad.

## 3. Grammatik / språkfel
- **"juli"-konstruktioner är klumpiga:** "Familje-Stundens **julipaketet**" (Draft 04, 03), "Familje-Stundens **julitema**" (Draft 06), "Familje-Stundens **julipaket**" (Draft 08). Dubbel bestämdhet ("Stundens … paketet") och hopskrivningen "juli+paket" skaver. Bättre: "Sagosommar-paketet" eller "paketet för juli".
- **Trasig hashtag:** Draft 07 har `#sommarmed barn` — mellanslag bryter taggen (blir `#sommarmed` + "barn").
- I övrigt korrekt, varm svenska; inga sakfel om pris (59 kr) eller innehåll.

## 4. Format-specifika problem
- **Instagram Story (Draft 05):** 675 tecken är **helt fel längd** — en Story ska vara 1–2 korta rader/overlay-text, inte ett långt inlägg. Bra emoji-punktlista (📖🎧✂️🏅) men den hör hemma i ett kort format, inte här.
- **Instagram Karusell (Draft 03):** 721 tecken caption + **dubbel CTA** ("Prova gratis … Följ @familjestunden"). Karusell-copy bör vara kort (slides bär budskapet) och ha *en* CTA.
- **Instagram Reel (Draft 01, 07):** rätt längd (~540 tecken), fungerar. Draft 07:s hashtags ligger i captionen (FS-stil vill ha 5–10 rena IG-taggar, ej trasiga).
- **Facebook (Draft 02, 04, 06, 08):** längre brödtext är OK för FB, men 06 (837) och 02 (613) glider mot för långt; FB tål berättande men inte utfyllnad.
- **Genomgående:** ingen tydlig längd-disciplin per format — Reels och Stories behandlas nästan som FB-inlägg.

## 5. Starkast presterande mönster
Det som faktiskt fungerar och bör förstärkas:

- **Konkret föräldra-igenkänning som hook (Draft 02):** barnet som frågar *"Vad händer om vi hittar på en egen saga?"* — en verklig situation, inte stämningsmåleri.
- **Tydlig nytta uttalad rakt:** "ingen förberedelse", "färdigt att öppna direkt", "saga, ljudsaga, pyssel, diplom" — finns i de bästa och är kärnan i value propen.
- **Kort, fräsch hook (Draft 07):** "Sommaren smakar saga" — tre ord, sticker ut.
- **Innehållslista (Draft 05):** punktlistan över vad som ingår är praktisk och scanbar — rätt instinkt, fel format.
- **En tydlig CTA (Draft 01, 08):** ett mål per post läser renare än dubbel-CTA.

## 6. Mest autentiska Familje-Stunden-mönster
Det som känns äkta FS och ska bevaras som kärna:

- **Nova & Pling i kanon:** Nova *känner/viskar* (känslohook), Pling säger *"Blipp blipp!"* och är lekfull — konsekvent och korrekt i alla 8. Detta är styrkan.
- **Skärmfri kvalitetstid + "tillsammans":** "stunder ni aldrig glömmer", "en historia som är helt er", "varje kväll" — träffar kärnvärdet.
- **Varm, trygg ton utan press:** Draft 08 är mest äkta — varm, minst säljig, "helt er" som avslut.
- **Provmånad + 59 kr nämnt naturligt** (Draft 06) utan att bli pushigt.

---

## Föreslagna Drafter-prompt-förbättringar (v2)
Mål: mänskligt, praktiskt, varmt, användbart — **inte** mer poesi. Konkreta regler att lägga till i
`buildDrafterSystemPrompt` / `buildDrafterUserMessage`:

1. **Längdtak per format (hård regel):**
   - IG Reel: ≤ 400 tecken, 1 hook + 1 nyttorad + 1 CTA.
   - IG Story: ≤ 120 tecken (1–2 rader) — aldrig ett helt inlägg.
   - IG Karusell: caption ≤ 300 tecken (slides bär budskapet), **en** CTA.
   - Facebook: ≤ 500 tecken, max 3 korta stycken.

2. **Hook-variation:** förbjud att återanvända samma hook-mall mellan poster i samma plan. Rotera hook-*typ*: (a) föräldra-situation/fråga, (b) konkret nytta först, (c) kort påstående, (d) Nova/Pling-replik. Max en "stämnings/strand"-hook per plan.

3. **Ban-lista för utslitna fraser:** undvik "Tänk dig/Föreställ dig: …", "sandkornen kittlar", "havet/vinden viskar", och högst **en** användning av "magi/magisk" per post. Em-streck max 1 per post.

4. **Nytta före stämning:** säg vad föräldern får inom de första 1–2 raderna (saga, ljudsaga, pyssel, diplom · ingen förberedelse · provmånad). Stämning får inte ta mer än en mening innan nyttan.

5. **Praktisk ton för 3–7-årsföräldrar:** skriv som en varm vän som tipsar en trött förälder — vardagsnära, konkret, "så här gör ni", inte litterärt. Tilltala föräldern direkt.

6. **Grammatik/format-städning (deterministiskt om möjligt):**
   - Skriv "Sagosommar-paketet" eller "paketet för juli" — aldrig "julipaketet/julitema".
   - Hashtags: 5–10 rena IG-taggar utan mellanslag; validera `^#[\wåäöÅÄÖ]+$` (Drafter har redan `normalizeHashtags` — utöka att släppa/laga trasiga taggar som "#sommarmed barn").
   - Exakt **en** primär CTA per post (matcha briefens CTA-typ); ingen dubbel-CTA.

7. **Behåll det som funkar:** Nova *känner*/Pling "Blipp blipp!" i kanon, skärmfritt + "tillsammans", "ingen förberedelse", provmånad/59 kr naturligt, varm trygg ton.

> Dessa ändringar är **förslag** — ingen prompt eller kod har ändrats. När du godkänner riktningen kan de
> formuleras in i Drafter-prompten (v2) och valideras genom att regenerera juli och jämföra mot denna rapport.
