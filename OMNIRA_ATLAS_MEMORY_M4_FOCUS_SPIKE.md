# Focus Derivation Spike — Atlas Memory M4 (recall relevance)

> Status: **DESIGN SPIKE** — arkitektur + rekommenderad M4-implementation. Ingen kod/DDL/migration.
> Bygger på ADR-ATLAS-001 v3 (MLMS): `memory_events` = spine · `memories` = procedural+decision · episodic recallas ur events · salience @read · endast project-scope i M4.
> Datum: 2026-06-16.

## 0. Kärninsikt (grundad i koden)

Fokus-maskineriet finns redan: **Atlas View Awareness (Foundation 1)** i `lib/atlas/view-context.ts` normaliserar en per-request "view envelope" till en betrodd `NormalizedView` — `destinationId`, `project`, `filters`, och `selection[]`/`visible[]` som `domain:id:label`. Dessa record-refs är **samma nycklar** som `memory_events`/`memories` bär i `(entity_kind, entity_id)`. M4 Focus Derivation är därför till 80 % *att återanvända Foundation 1 som fokuskälla* — inte bygga nytt. View Awareness renderar redan ett `[CURRENT VIEW]`-block; minnet får ett parallellt `[ATLAS MEMORY]`-block matat av **samma** `NormalizedView`. View säger VAD som är på skärmen; minnet säger VAD VI LÄRT OSS om det.

Viktig konsekvens: fokus är **efemärt och per-request** (envelopen re-resolvas serverside varje tur, persisteras aldrig). Det eliminerar en hel klass av fokus-drift gratis.

---

## 1. Focus-modellen

### 1.1 Två roller — håll isär dem
Fokus gör två saker som aldrig får blandas:

- **Scope-grind (hård filtrering, isolering):** `allowedProjectIds` + ev. aktivt projekt. Detta *exkluderar* — det är isolering, inte ranking, och relaxas aldrig. (I M4: project-scope only.)
- **Relevans-boosters (mjuk ranking):** en viktad mängd fokus-entiteter `{(entity_kind, entity_id, weight)}` som *höjer* salience men aldrig exkluderar. Ett minne utan fokusmatch försvinner inte — det rankas bara lägre.

### 1.2 Fokuskällor (alla redan tillgängliga, ingen ny infra)
| Källa | Hur den härleds | Ger |
|---|---|---|
| **Selection** | `NormalizedView.selection[]` (operatör har explicit valt rader) | skarpast fokus-entiteter (domain→entity_kind, id→entity_id) |
| **Active run/agent/workflow** | route `/runs/[id]` el. exekverande run i sessionen; `atlas_actions.target_kind/target_id` | exekverings-entiteter (run + dess workflow + agenter) |
| **View destination + filters** | `destinationId` + whitelistade `filters` | sid-/tillstånds-fokus (t.ex. approvals?state=pending) |
| **Conversation** | senaste N user-turer; **lexikal** match mot kända namn + view:ens labels | omnämnda entiteter/topics (ingen embedding) |
| **Project** | `NormalizedView.project` + `allowedProjectIds` | scope-ankare (hård grind) |
| **Visible** | `NormalizedView.visible[]` | ambient fokus (mjuk, svag boost) |
| **topPriority** | `gatherAtlasContext().topPriority` | fallback-fokus när inget explicit finns |

### 1.3 Prioriteringsordning vid flera samtidiga fokus
Explicit > pågående handling > vy > konversation > ambient > fallback. Projektscope ligger utanför ordningen (alltid hård grind).

1. **Selection** (explicit val) — högst vikt.
2. **Active run/workflow/agent** (handlar på en exekvering).
3. **View destination + filters** (sidan + tillståndet).
4. **Conversation-entiteter** (omnämnt denna tur; avtar per tur).
5. **Visible** (ambient; svag boost).
6. **topPriority** (endast om fokusmängden annars är tom).

Kombinationsregel: inom scope summeras vikterna additivt per entitet; den skarpaste signalen sätter *primär* fokus-entitet. Konversationsfokus har recency-avklingning inom sessionen (senaste turen > tidigare). Inget fokus persisteras serverside.

---

## 2. Recall-strategin

### 2.1 Kandidatval (M4, inga embeddings)
Hårda filter först (billigt, isolering + brus-golv):
- Scope: project ∈ allowedProjectIds (world deferad → project-only i M4).
- `memories`: `status='active'`. `memory_events` (episodic): `occurred_at > now()−90d`.
- `confidence ≥ minConfidence`.

Sedan UNION av de två källorna (procedural/decision-memories + episodiska events), salience beräknad **inline** (uttrycket i ADR v3 §6).

### 2.2 Hur fokus påverkar ranking
`final_score = salience · (1 + Σ boost)` där boost adderas per matchande fokussignal:
- **Entitets-exakt match** (`entity_kind`+`entity_id` finns i fokusmängden): +0.6–1.0 × signalvikt (starkast).
- **Klass-relevans** (decision-minnen är nästan alltid relevanta; procedural matchar aktiv output-typ): +0.2.
- **Lexikal topic-match** (fokus-keyword mot `summary`, via ILIKE / valfritt `pg_trgm`): +0.1–0.3. Ingen semantisk likhet i M4.

Boost *multiplicerar* salience → ett lågsalient men exakt fokus-träffat minne kan klättra, men brus utan vare sig salience eller fokus stannar nere.

### 2.3 Hur irrelevanta minnen filtreras bort
- **Hårt:** scope, status, confidence-golv, ålder (episodic 90d).
- **Mjukt (focused-läge):** när ett *starkt explicit* fokus finns (selection/run), begränsa paketet till fokus-relaterade minnen + en liten "always-include"-svans (pinned + senaste decisions). Minnen utan relation till fokus-entiteten faller utanför budgeten.
- **Diversitetstak:** max K per entitet och per klass, så en brusig entitet inte översvämmar paketet.
- **Tomt är OK:** finns inget relevant injiceras inget. "Inget minne" slår "brusigt minne".

### 2.4 Två lägen
- **Focused** (explicit fokus finns): boost + hård begränsning till fokus-entiteter, liten ambient-svans.
- **Ambient** (inget explicit fokus, t.ex. Atlas Home): top global salience inom project-scope + pinned + senaste decisions + topPriority-relaterat.

---

## 3. Context-paketet (MemoryPack)

### 3.1 Struktur — sektionerat på roll, inte bara klass
1. **Decisions & Pinned** (alltid med, hårt cap ~3–5): operatörsbeslut Atlas måste hedra (återanvänder dagens `DecisionContext`/`selectActiveDecisions`) + pinned. Dessa är "lag", inte förslag.
2. **Focus** (huvuddelen): de boostade, fokus-relevanta minnena.
3. **Ambient** (liten svans ~2–4): högsalienta projekt-minnen som inte är fokus-träffade men värda att ha.

Varje item: `summary · confidence% · source · last_seen · entity`. Provenance alltid med.

### 3.2 Hur mycket som skickas — rekommenderad budget
- **Total token-budget: 1 200** (lägre än ADR:s 1 500-tak — börja snålt; höj på mätning).
- Tiered cap: Decisions/Pinned ≤ 250 · Focus ≤ 750 · Ambient ≤ 200.
- Realistiskt ~12–18 rader. Hård trunkering på `final_score`; `truncated:true` flaggas i paketet.

### 3.3 Rendering
Distinkt `[ATLAS MEMORY]`-block, **skilt** från live-datasnapshot och `[CURRENT VIEW]`. Grupperat per sektion, `confidence%`+källa per rad, score-ordnat, pinned/decisions först. Matas av samma `NormalizedView` som View Awareness.

---

## 4. Failure modes

### 4.1 Fokus-drift
Fokus fastnar i en stale signal (rad vald för 20 min sen; konversations-entitet 10 turer bak) → recall surfar irrelevant minne.
**Mitigering:** fokus är per-request och persisteras aldrig (envelopen är färsk varje tur → selection/view-fokus kan inte driva). Konversationsfokus recency-avklingar per tur. TTL på alla fokussignaler. Ingen serverside-fokus-state.

### 4.2 Context pollution
För många lågrelevanta minnen späder prompten, höjer kostnad, sänker Atlas-kvalitet.
**Mitigering:** hård token-budget (1 200), diversitetstak, confidence/salience-golv, focused-läge-begränsning, "tomt slår brus". Mät paketstorlek + injektionsfrekvens i `memory_health_v`.

### 4.3 Feedback loops ("rich get richer")
Recall förstärker åtkomna minnen → ofta-recallade minnen rankas högre → recallas mer → skenande dominans.
**Mitigering:** **access-reinforcement är AVSTÄNGT i M4** (inga access-events per ADR v3) → loopen existerar inte. Recall är strikt **read-only** — genererar aldrig minne av att läsa minne. Om förstärkning införs senare: förstärk endast på **positivt utfall**, inte på mere retrieval; cappa + decay förstärkningen.

### 4.4 Memory hijacking / poisoning (den allvarliga)
Ett minne bär attacker-kontrollerad eller felaktig text (t.ex. prompt-injection i skrapat/lead-fritext-innehåll som lagras som minne och sen recallas in i Atlas context och påverkar beslut).
**Mitigering (lager):**
- **Minne är DATA, inte INSTRUKTIONER:** `[ATLAS MEMORY]`-blocket avgränsas tydligt och Atlas instrueras att behandla minnesinnehåll som referens, **aldrig** som kommandon (försvar mot lagrad prompt-injection).
- **Trust + confidence-golv:** lågtrust-källor rankas inte upp; echo-naiv confidence (M4-brasklapp) surface:as med provenance så varken Atlas eller människa övertror den.
- **Provenance synlig** på varje rad (källa + evidence + last_seen) → spårbart.
- **Människa pin/glöm/korrigera** + project-scope-isolering begränsar blast radius.
- **Ingen autonom konsekvent handling** från recallat minne utan den befintliga människo-godkännandegrinden.

---

## 5. Rekommenderad M4-implementation (minimal)

Ingen embeddings, ingen vector search, ingen Graphify, ingen Obsidian. Allt nedan vilar på befintlig infra.

1. **Focus = ren funktion** `deriveFocus(view: NormalizedView, conversation, activeRun?) → FocusSet`. Återanvänder Foundation 1 (`view-context.ts`); ingen ny tabell, ingen persistens. `FocusSet = { scope: {allowedProjectIds, activeProject}, boosters: [{entity_kind, entity_id, weight, ttl}], topics: string[] }`.
2. **Matchning = lexikal/id-baserad:** fokus-refs matchas mot `(entity_kind, entity_id)` med likhet; topics mot `summary` med ILIKE (valfritt `pg_trgm`). Ingen semantisk likhet.
3. **Recall** = hård scope-grind + salience@read + fokus-boost (entitets-exakt primärt, lexikalt sekundärt) + diversitetstak + budget. UNION (memories + episodiska events). Två lägen (focused/ambient).
4. **MemoryPack** = 3 sektioner (decisions/pinned · focus · ambient), 1 200 token-budget, provenance per rad.
5. **Reinforcement AV** (inga access-events) → ingen feedback-loop.
6. **Dark-launch först (avriskar exakt den uttalade osäkerheten):** kör recall i **shadow-läge** bakom flagga (mönster som `ATLAS_VIEW_AWARENESS`, default av) — beräkna och **logga** paketet, injicera **inte** i Atlas-prompten. Mät relevans (manuell eval + `memory_health_v.accessed_7d`/paketstorlek) i några dagar. **Slå på injektion först när shadow-evalen är grön.** Detta gör recall-kvalitet mätbar innan den påverkar Atlas output — vilket är hela poängen med denna spike.

### Avgränsat (medvetet ej i M4)
Semantisk/embedding-fokus, vektor-similarity, entitetsresolution (alias→kanonisk), graf-traversering för "relaterade entiteter", cross-project/world-fokus, access-reinforcement. Alla additiva i M5+ ovanpå samma `FocusSet`-kontrakt.

### Öppet inför bygge
Exakta boost-vikter och budget-fördelning (satta ovan, tunbara via shadow-eval), och om `pg_trgm` ska aktiveras för topic-match eller om enkel ILIKE räcker i M4 (rekommendation: börja med ILIKE, lägg `pg_trgm` om lexikal träffbild är för trubbig).
