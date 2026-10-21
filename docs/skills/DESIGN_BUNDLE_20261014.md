# Designpaket installerat 2026-10-14

## Verifierat resultat

Åtta upstream-färdigheter finns i repoets `.agents/skills`, samt lokalt i Omniras överordnade `.agents/skills` och `.claude/skills` för utvecklingssessioner. Nya sessioner måste upptäcka dem; redan startade sessioner är inte verifierade.

- design-taste-frontend: ny publik webbplats och designriktning.
- redesign-existing-projects: förbättra befintligt gränssnitt.
- impeccable: designgranskning, layout, typografi, tillgänglighet och polish.
- emil-design-eng: design engineering.
- animate, review-animations, improve-animations: animationer och granskning.
- break-ui: svåra innehållsfall och responsivitet.

`design-bundle.lock.json` anger exakta upstream-commits och SHA-256 för 110 filer. Inga befintliga skills skrevs över. Källornas licenser följer med varje skill.

Taste draw-körning med Omnira-brief gav tre designriktningar. Impeccables Windows-launcher svarade `impeccable-engine 0.1.14`, exit 0. Launchern verifierar nedladdningens checksumma och använder en lokal versionscache. Inget betalt modellanrop eller bild-/videogenerering kördes.

## Viktig begränsning

Detta installerar färdigheterna för lokala utvecklingsagenter. Det aktiverar INTE Atlas i produktion och bevisar INTE att Atlas kan bygga eller publicera en hemsida autonomt.

Aktuell main vid undersökningen: d21cac0. `apps/web/lib/atlas/workpackage/roles.ts` beskriver uttryckligen att `agents.skill_ids` inte har något register att lösa mot. `apps/web/lib/ai/workflow-runner.ts` läser `system_prompt` och använder inte dessa Markdown-filer. Kodarbetarens deklarerade adapter har inga verktyg, ingen shell och ingen direkt filåtkomst. Den befintliga broker-kedjan ska inte ges större behörigheter genom en skillinstallation.

Playwright MCP och Figma är inte installerade eller anslutna av denna ändring. Webbläsarkontroller för Taste och Impeccable har inte testats på en byggd sida.

## Ootto för The Prompt — undersökt, inte installerat

Källor: https://ootto.ai/blog/claude-instagram-connector och https://github.com/Ootto-AI/claude-content-skills.

Gratis analys-/manusfärdigheter är separata från Oottos betalda MCP-tjänst. Upstream content-factory förutsätter Apify, Composio/Instagram och Remotion för hela körkedjan. Installation av Markdown ger inte tillgång till kontodata, videorendering eller publicering. Inget Instagram-konto anslöts och inga inlägg, kommentarer eller DM skickades.

Rekommenderat första innehållspaket är content-audit, reel-analyzer, viral-hook-writer, reel-scripter och caption-and-hashtags. Det ska använda Omniras befintliga projektminne. Autopublicering och kommentars-/DM-automation ligger utanför denna installation.
