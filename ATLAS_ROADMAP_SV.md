# Projekt Atlas — Roadmap

Atlas är Omniras "Executive Chief of Staff"-lager. Det **ersätter inte** de
underliggande systemen (agenter, arbetsflöden, kostnader, granskningar, minne) —
det blir operativsystemslagret *ovanpå* dem, och det första operatören möter.

Princip: **intelligens, minne, delegering, transparens** — inte visuella effekter.

---

## Fas 1 — Atlas Home + Kontext-hjärna  ✅ (byggt)

Grunden: Atlas blir ingången och ser redan allt.

- **Atlas-identitet** (`lib/atlas/identity.ts`) — system-prompten för en
  Executive Chief of Staff + permanenta affärsprofiler (Familje-Stunden =
  kvalitet före automation; GainPilot = leadsgenerering; The Prompt = AI-media).
  Operatören behöver aldrig upprepa detta.
- **Kontext-hjärna** (`lib/atlas/context.ts`) — en defensiv, läs-bara funktion
  som bygger en live-ögonblicksbild från befintliga tabeller: kostnad idag/vecka/
  månad (+ prognos + per leverantör), intäkt och kostnad per verksamhet,
  kvalificerade leads, media publicerat denna vecka, väntande granskningar,
  väntande godkännanden, fallerade körningar (24h), och den enskilt viktigaste
  åtgärden just nu.
- **Atlas Home** (`app/(platform)/atlas/page.tsx`) — tidsanpassad
  chefshälsning, briefing-rader per verksamhet, AI-kostnadsrad, en rekommenderad
  åtgärd, snabbåtgärder (prioriteringar, granskningar, intäkter, kostnader, prata
  med Atlas), en plattforms-pulsrad och ett bevaknings-rutnät per verksamhet.
- **Ingången** — roten + efter inloggning landar nu på `/atlas`; Atlas är det
  översta, primära valet i sidofältet. Operationscentralen finns kvar som detaljvy.

---

## Fas 2 — Konverserande Atlas + transparens  (nästa)

Gör Atlas till något du *pratar med*, med minne och full insyn.

1. **Ge chatten Atlas-identitet.** Peka `app/api/chat/route.ts` mot
   `buildAtlasSystemPrompt()` och injicera den live-ögonblicksbilden varje tur,
   så att Atlas svarar "hur mycket har vi spenderat / hur många leads / vad ska
   jag fokusera på" direkt från riktig data.
2. **Konversationsminne.** Återanvänd befintliga `conversations` /
   `conversation_messages` + `platform_memory`. Atlas minns preferenser,
   senaste beslut och väntande uppgifter mellan sessioner — inget upprepande.
3. **Röst som känns levande.** Längre paus innan avbrott, live-transkribering,
   korta konversationsbitar (aldrig monologer), spara + spela upp samtal, tillåt
   avbrott.
4. **Atlas Activity Center** (ny sida) — live-transparens över vad Atlas och
   agenterna gör just nu: körande arbetsflöden, framsteg, senaste beslut,
   väntande beslut. Hämtas från `runs`, `run_logs`, `agent_messages`,
   `manager_tasks`. Operatören ska aldrig undra "hände något?".
5. **Bädda in samtalet i Atlas Home** så att prata med Atlas blir standardvalet,
   inte en separat sida.

---

## Fas 3 — Delegering + briefingar + verktygsintelligens

Atlas agerar, inte bara rapporterar.

1. **Delegeringssystem.** "Atlas, skapa en GainPilot-kampanj" → Atlas skissar en
   plan, tilldelar agenter, spårar kedjan och rapporterar framsteg
   (Research ✓ · Copy ✓ · Bild ⏳ · QA ⏳). Byggt på `manager_tasks` +
   `agent_messages` + körmotorn, med delegeringskedjan synlig live.
2. **Verktygsintelligens.** Atlas väljer automatiskt rätt verktyg/arbetsflöde
   (publicering, analys, planering, godkännanden, kostnadsspårning) — operatören
   behöver aldrig veta vilken agent eller vilket flöde som ska användas.
3. **Chefsbriefingar.** Morgon / kväll / vecka / månad, med intäkter, kostnader,
   tillväxt, risker, möjligheter och rekommendationer. Bygger vidare på befintliga
   `morning_briefings` + briefing-motorn; schemaläggs via cron-systemet.
4. **Atlas blir plattformen.** Allt annat (agenter, arbetsflöden, analys,
   kostnader, godkännanden) lägger sig som stödjande infrastruktur under Atlas.

---

## Noteringar

- Atlas återanvänder det som finns (Managerns `buildContext`, `cost_events`,
  `platform_memory`, briefing-komponenter) istället för att duplicera det.
- Affärsprofilerna ligger nu i kod (`identity.ts`); Fas 2 kan flytta dem till
  `projects.settings` så att de kan redigeras utan deploy.
- Kontext-hjärnan är deterministisk och gratis att köra; AI används bara där det
  tillför verklig reasoning (samtal, briefing-syntes), vilket håller kostnadssidan ärlig.
