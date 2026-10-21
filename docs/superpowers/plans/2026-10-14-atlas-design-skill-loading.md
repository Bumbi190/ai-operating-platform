# Atlas designfärdigheter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ge Atlas och uttryckligen tilldelade projektagenter läsåtkomst till det versionslåsta designpaketet utan att utöka exekveringsrättigheter.

**Architecture:** Generera ett deploybart innehållspaket från de åtta installerade skillsen. Ett rent register validerar ID och referenser; befintlig Atlas-tool-dispatch och agentpromptkomposition använder registret. Det kör inga upstream-scripts.

**Tech Stack:** Node.js, TypeScript, Next.js 14, Vitest; befintlig projektbehörighet.

**Spec:** `docs/superpowers/specs/2026-10-14-atlas-design-skill-loading.md`

## Global Constraints

- Endast de åtta ID:na i `docs/skills/design-bundle.lock.json` får registreras.
- Källfiler måste matcha manifestets SHA-256. Ingen runtime-nedladdning.
- Skills är kunskap, aldrig behörighet eller bevis på förmåga att köra shell, bygga, testa eller publicera.
- Använd befintlig projektägande-/åtkomstkontroll. Inga DB-migrationer eller rättighetsändringar.
- Leverans 1 ska beskrivas som kunskapsladdning och designplanering, inte färdig webbbyggare.
- Läsverktyget returnerar högst 16 000 tecken per anrop och explicit fortsatt offset. Agentkomposition har högst 64 000 tecken skilltext totalt; överträdelse blir ett tydligt fel.

## Review Focus

1. Ett tillåtet skill-ID med en otillåten referens måste nekas.
2. En för stor skill får inte tyst kapas i agentens prompt.
3. En gammal, okänd skill-etikett får inte skapa verifierad exekveringsförmåga.
4. Upstream-instruktioner får inte ersätta systempolicy eller projektgränser.
5. En produktionsbundle måste fungera utan den lokala Omnira-katalogen.

---

### Task 1: Deploybart paket och register

**Files:** Create `apps/web/scripts/build-design-skills.mjs`, `apps/web/lib/skills/design-registry.ts`, `apps/web/lib/skills/generated/design-bundle.json`; Test `apps/web/lib/qa/design-skill-registry.test.ts`.

**Interfaces:** `listDesignSkills(): DesignSkillMetadata[]`; `readDesignSkill(input: { id: string; reference?: string; offset?: number; limit?: number }): DesignSkillChunk`. Chunk innehåller källa, commit, hash, text och `nextOffset: number | null`.

- [ ] Skriv tester för okänt ID, traversal, absolut referens, icke-registrerad referens, fel hash och pagination över 16 000 tecken.
- [ ] Kör Vitest-filen och verifiera att den först misslyckas på saknad implementation.
- [ ] Generera JSON från lockfilen och verifiera varje bytehash. Inkludera bara SKILL.md och registrerade instruk­tionsreferenser; inga körbara scripts eller eval-data i runtime-innehållet.
- [ ] Implementera registreringen och tillåt endast manifestbaserade referenser. Verktyget tar inte godtyckliga filvägar.
- [ ] Kör tester och generator; verifiera att det genererade paketet kan användas utan källkatalogen.
- [ ] Commit med bara dessa filer.

### Task 2: Atlas läsverktyg

**Files:** Modify `apps/web/app/api/chat/route.ts`; Test `apps/web/lib/qa/design-skill-chat.test.ts`.

**Interfaces:** Verktygen `list_design_skills` och `read_design_skill` använder registret från Task 1, befintlig chattägarkontroll och standardverktygsloop. Inget nytt dispatch- eller effektverktyg.

- [ ] Skriv tester som verifierar autentiseringskrav, registerbaserad läsning, begränsad payload och nekad okänd skill/referens.
- [ ] Kör och verifiera initialt fel.
- [ ] Lägg till schemas och handlers vid befintlig TOOLS/executeTool. Ge Atlas kort vägledning att läsa relevanta skills vid designuppdrag och redovisa exekveringsberoenden.
- [ ] Kör riktade chat-/ägande-/workflow-isoleringstester. Kontrollera att fast/static-path inte oavsiktligt får verktyg.
- [ ] Commit med bara dessa filer.

### Task 3: Tilldelad agentkunskap

**Files:** Create `apps/web/lib/skills/compose-agent-skills.ts`; Modify `apps/web/lib/ai/workflow-runner.ts`; Test `apps/web/lib/qa/agent-design-skills.test.ts`.

**Interfaces:** `composeAgentDesignSkills(systemPrompt: string, skillIds: string[]): { systemPrompt: string; loadedSkillIds: string[]; unresolvedSkillIds: string[] }`. Bara de tilldelade registrerade ID:na laddas. Okända etiketter redovisas separat och ändrar inga rättigheter.

- [ ] Skriv tester för oförändrad prompt utan skills, explicit tilldelning, dubbletter, okända ID:n, max 64 000 tecken och policygräns före skilltexten.
- [ ] Kör och verifiera initialt fel.
- [ ] Läs `skill_ids` tillsammans med agenten i workflow-runner och komponera rätt agents prompt. Ingen agentskapande eller DB-tilldelning sker som sidoeffekt.
- [ ] Kör agenttester och befintliga workflowtester. Visa vilka tilldelningar som saknas före ett riktigt projektjobb.
- [ ] Commit med bara dessa filer.

### Task 4: Verifiering och överlämning

- [ ] Kör riktade nya tester och befintliga chat-/workflow-kontroller, typecheck samt diffkontroll för egen kod.
- [ ] Bygg en preview efter uttryckligt godkänd uppladdning. Inga manuellt triggade hosted CI-jobb.
- [ ] Verifiera med en riktig Atlas-läsning på preview: vald skillversion och referens syns, inga upstream-scripts körs.
- [ ] Rapportera kunskapsladdningen separat från hemsidebygge, browser-test och publicering. Dessa delar får inte markeras klara.

## Separat efterföljande arbete

Webbbyggaren behöver en egen design som återanvänder Omniras begränsade broker-/governance-kedja och bevisar verkliga filer, bygge, preview och browser-test. Mediaförbättringen ska först kartlägga dagliga anrop till DB-prompten respektive `buildScriptSystem`, befintlig statistik och projektbundna credentials. Ingen autopublicering, kommentarsautomation, DM eller ny prenumeration aktiveras genom denna plan.
