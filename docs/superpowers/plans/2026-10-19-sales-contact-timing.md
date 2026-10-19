# Handlarbörsen Contact Timing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax. Preserve the established inline execution method: the primary agent implements the tasks, followed by one independent review of the complete increment. No per-task reviewer loop.

**Goal:** Ge Atlas och André en källmärkt kontaktlogg och serverberäknad datumkontroll som blockerar osäker säljförberedelse utan att aktivera kundutskick.
**Architecture:** Två append-only tabeller lagrar historik per mottagaradress och ägarbekräftade regler. En gemensam SQL-beräkning används av arbetsyta, Atlas och första säljjobbets kontroller; TypeScript visar serverresultatet och gör inte en egen tillåtelseberäkning. Metadata sparas genom en separat ägarvy, utan direktimport eller utökade postfacksbehörigheter.
**Tech Stack:** Befintlig Next.js 14.2.29, TypeScript, React 18, Supabase/Postgres, Vitest 2.1.9 och Playwright. Inga nya paket eller providers.
**Spec:** `docs/superpowers/specs/2026-10-19-sales-contact-timing-design.md`, godkänd av André 2026-10-19 kl. 08:27:20 Europe/Stockholm.
**Execution:** Inline enligt befintligt arbetssätt i `2026-10-18-sales-reply-sending.md`. Denna plan inväntar granskning innan implementation.

## Global Constraints

- Projekt `8f673c09-1c8f-4d78-876e-4c14bf1c89b3`; alla 139 kontaktpayloads och 17 projektminnen ska bevaras. Inga kontakter bekräftas, avspärras eller slås ihop.
- Minsta föreslagna väntetid: `1 209 600 sekunder` = `14 × 24 timmar`. Högsta antal obesvarade påminnelser per aktuell inbjudan: `en`, inklusive redan skickade. Källornas högsta ålder för aktuell granskning: `900 sekunder` = `15 minuter`.
- Sparad källa och faktiskt kontrollerat tidsfönster är olika saker. Okänd historik, lucka, för gammal avstämning, oklart utfall eller oklassificerat relevant mejl blockerar.
- Regler och historik får sparas enbart genom en explicit ägaråtgärd. Atlas får endast läsa via ett specifikt verktyg. Migrationen skapar inga historik- eller regelrader.
- Kontaktspärr, exkludering, avregistrering, studs, nej och avvakta överordnas tidsgränsen. Ett nytt kampanjnamn nollställer inte en öppen obesvarad kontakt.
- Faktiskt kundbegärt svar hanteras i befintligt separata svarsförslag; modellen får inte klassificera en påminnelse som svar för att kringgå kontrollen.
- `customerSendingEnabled:false` på samtliga nya läsresultat. Ingen kundtransport, kalenderpost, utskickssekvens, ny tillåtelselista eller testomsändning.
- Inga nya Strato-/Resend-behörigheter, workers, credentials, fria URL-hämtningar eller externa sändningsanrop. Befintligt privat testsvar och dess policy lämnas orörda.
- UTC för jämförelse; `Europe/Stockholm` med faktisk UTC-offset för presentation. En tidsgräns är aldrig en schemaläggning eller sändningstillåtelse.
- Samma ägar-/projekt-/konversationskontroller, same-origin för mutationer och strikt indata som befintligt säljflöde. Nya tabeller har RLS och explicita minimala grants.
- Befintlig worktree/gren används. Ingen merge eller produktionspromovering. Supabase-migration skapas med CLI:s `migration new`, aldrig gissat tidsfilnamn.
- Gör riktade RED→GREEN-prov och en avslutande oberoende granskning. Återkör större testmängder endast vid ny ändring/failure/olöst risk; skilj historiska fel från nya.

## Review Focus

1. Samma mottagare med versaler/blanksteg och två filialrader ska få en gemensam kontroll, utan ändring av filialerna. Test i Task 1/2.
2. Nyligen sparad gammal källa, källa med bara datum eller saknad äldre historik får inte bli aktuell genom `observedAt`. Test i Task 1/2.
3. Ny regel-/historikversion eller kontaktadress mitt under förberedelse måste stoppa gammalt jobb före modellförsök/resultat. Test i Task 3.
4. Samma mejl synligt i båda kanalerna, oklart utfall eller nytt inbjudansnamn får inte minska påminnelseantalet utan explicit källkoppling. Test i Task 2.
5. API-fel, saknad regel eller gammal flik får inte visas som noll tidigare mejl eller ledigt utskicksdatum; ingen granskning får skapa sändningsrätt. Test i Task 4/5.

---

## File Structure and shared contracts

Create `apps/web/lib/sales/timing/{types,validate,store,api,atlas-tools,view-model}.ts`; varje modul har en roll: kontrakt, validering, RPC, HTTP, Atlas respektive svensk presentation. Motsvarande tester ligger bredvid modulerna.

Create `apps/web/app/api/sales/timing/route.ts`, `apps/web/components/platform/vnext/sales/SalesContactTiming.tsx`, `apps/web/supabase/tests/sales_contact_timing.sql`, `apps/web/scripts/test-sales-timing-races.mjs`, `apps/web/lib/qa/sales-timing-integration.test.ts` och `apps/web/e2e/sales-timing.spec.ts`.

Modify smalt: `lib/sales/{types,atlas-tools,view-model}.ts`, `SalesWorkspace.tsx`, `SalesWorkspace.module.css`, `scripts/test-sales-db.mjs`, migration-guard/schema-inventering, befintlig browserfixture och berörda säljtester. Ändra inte svars-/sändningsmoduler eller workertransport.

All paths nedan är relativa till `apps/web`, utom dokumentation.

**Typer som Task 1 låser:**
- `TimingRulesInput={projectId,idempotencyKey,expectedPreviousId:string|null,minWaitSeconds:number,maxReminders:number,maxSourceAgeSeconds:number,confirmed:true}`.
- `HistoryRevisionInput={projectId,idempotencyKey,expectedPreviousId:string|null,contactId,expectedContactVersion:number,data:HistoryData,confirmed:true}`. Adressen hämtas från serverns kontakt; ingen fri adressparameter.
- `HistoryData={schemaVersion:1,contactVersions:{id,version}[],history:'unknown'|'owner_confirmed_none'|'contacted',olderHistoryAttestation:string|null,sources:HistorySource[],events:HistoryEvent[],correctionOf:string|null,reviewNote:string}`.
- `HistorySource={sourceKey:string,channel:'strato_sent'|'strato_inbox'|'resend'|'operator',identityRef:string,scopeRef:string,since:string,through:string,observedAt:string,state:'complete'|'gap'|'failed',reference:string}`.
- `HistoryEvent={id:string,sourceRefs:string[],providerRefs:{sourceKey,id}[],occurredAt:string,direction:'outbound'|'inbound',outcome:'accepted'|'delivery_unknown'|'failed_before_send'|'received'|'bounced'|'unsubscribed',kind:'initial'|'reminder'|'requested_reply'|'unclassified',invitationId:string|null,inReplyToEventId:string|null,reviewedDuplicateOf:string|null}`.
- `HistoryRevision={id:string,projectId:string,recipient:string,version:number,previousId:string|null,data:HistoryData,reviewedBy:string,createdAt:string}`; `TimingRulesRevision={id:string,projectId:string,version:number,previousId:string|null,minWaitSeconds:number,maxReminders:number,maxSourceAgeSeconds:number,reviewedBy:string,createdAt:string}`.
- Alla projekt-/kontakt-/revisions-/event-/inbjudans-ID:n och idempotensnycklar är UUID. sourceKey/provider-ID är begränsade källsträngar. En dubblettreferens måste finnas i samma revision, ha samma mottagare och får inte vara självrefererande eller bilda kedja/cykel.
- Regelinmatning får bara skärpa skyddet: heltal minWaitSeconds >= 1209600, maxReminders 0 eller 1 och maxSourceAgeSeconds 1–900. Startförslaget är exakt 1209600/1/900. Lägre väntetid, fler påminnelser eller äldre källor kräver separat framtida designbeslut och tillåts inte av denna leverans.
- `TimingReadInput={projectId,contactIds?:string[]}`; inga fritextadresser, klienttider, beslut eller avsiktsundantag från modellen.
- `ContactTiming={contactId,recipient,contactVersion,historyRevisionId:string|null,ruleRevisionId:string|null,latestObservedOutboundAt:string|null,reminderCount:number|null,intervalFloorAt:string|null,sourceThrough:string|null,blockers:string[],initialPreparationAllowed:boolean}`.
- `TimingReport={projectId,evaluatedAt,contacts:ContactTiming[],rules:TimingRulesRevision|null,customerSendingEnabled:false,workspaceUrl}`.
- Blockerkoder: RULE_REVIEW_REQUIRED, HISTORY_REVIEW_REQUIRED, CONTACT_UNCONFIRMED, CONTACT_SUPPRESSED, CONTACT_EXCLUDED, RECIPIENT_STOPPED, PROJECT_PAUSED, SOURCE_STALE, SOURCE_GAP, SOURCE_CHANGED, EVENT_CLASSIFICATION_REQUIRED, INVITATION_UNRESOLVED, DUPLICATE_UNRESOLVED, SEND_PENDING, SEND_UNCERTAIN, REPLY_REVIEW_REQUIRED, REMINDER_LIMIT, WAIT_INTERVAL, NOT_INITIAL_CONTACT. Felaktigt lagrat kontrakt ger UNAVAILABLE i stället för ett användbart grönt resultat.
- SQL är enda beslutsmotor. `blockers` är stabila koder; UI mappar dem till svenska. `null` betyder okänt/saknat, aldrig noll.
- API/RPC sparar endast metadata: inga body/subject/password/token/fetchUrl-fält. Befintlig HTTP-gräns 65 536 bytes består. Max 100 events, 8 sources, 16 kontaktkopplingar; varje referens/notering max 500 tecken. En för stor historia ger synligt fel, aldrig trunkerad ”komplett” historik.
- Läsning med explicit urval accepterar 1–200 unika kontakt-ID:n. Utan urval hämtas hela projektets kontroller; om ett projekt har över 200 kontakter returneras ett tydligt storleksfel tills pagination implementeras, aldrig en tyst delmängd.
- Tider måste vara fullständiga RFC3339-strängar med Z/offset, giltiga och inte senare än serverns kontrolltid; `since<=through<=observedAt`. DB validerar samma semantik oberoende av TypeScript.

### Task 1: Strict metadata contracts and truthful presentation

**Files:** create timing/types.ts, validate.ts, view-model.ts and tests.
**Consumes:** befintliga `salesId`, `fields`, `normalizeSalesEmail`, `SalesError`.
**Produces:** ovanstående typer; `parseHistoryRevision(v:unknown):HistoryRevisionInput`, `parseTimingRules(v:unknown):TimingRulesInput`, `parseTimingRead(v:unknown):TimingReadInput`, `timingBlockerLabel(code:string):string`, `formatTimingInstant(value:string):string`.

- [ ] Write failing tests: date_only_refused; offset_required; unknown_and_secret_fields_refused; duplicate_source_or_event_ids_refused; cyclic_duplicate_reference_refused; weaker_rule_values_refused; data_over_limits_refused; max_contacts_no_silent_truncation; unknown_blocker_stays_blocked. Exempel: `expect(()=>parseHistoryRevision({...valid,body:'x'})).toThrow('INVALID_BODY')`; `expect(timingBlockerLabel('NEW_CODE')).toBe('Underlaget behöver granskas')`.
- [ ] Run from apps/web: `node ../../node_modules/vitest/vitest.mjs run lib/sales/timing/validate.test.ts lib/sales/timing/view-model.test.ts`. Expected RED för saknade moduler.
- [ ] Implement parsergränserna ovan, strikt fältlista och formattering med Stockholm + offset. UI får inte räkna tidsgränser eller bedöma leverans. Validera att eventriktning/utfall stämmer och att sourceRefs/providerRefs refererar till kända sourceKey; äldre-historikintyg krävs när owner_confirmed_none stöds enbart av begränsade källfönster.
- [ ] Run same command. Expected PASS; datum med bara kalenderdag och avsaknad av offset nekas.
- [ ] Commit `feat: define strict contact timing contracts`.

### Task 2: Immutable history/rules and authoritative SQL evaluation

**Files:** create generated migration via `supabase migration new sales_contact_timing` från apps/web; supabase/tests/sales_contact_timing.sql; timing/store.ts + store.test.ts; modify scripts/test-sales-db.mjs, migration-guard-policy.mjs, lib/qa/migration-guard-v2.test.ts, tests/isolation/schema-security.json och relevant befintlig schema-grant-inventering.
**Consumes:** Task 1 contracts, `sales_owner`, `salesRpc`, kontakt- och inkorgstabeller samt sändningsmetadata.
**Produces:** tables `sales_contact_history_revisions`, `sales_contact_timing_rules`; fixed owner RPCs `sales_timing_save_history(p_principal,p_input)`, `sales_timing_save_rules(p_principal,p_input)`, `sales_timing_read(p_principal,p_input)`; internal invoker functions `sales_timing_evaluate(pid uuid,cid uuid,at timestamptz) returns jsonb` and `sales_timing_assert_snapshot(j public.sales_jobs) returns void`. Inga klientgrants till interna funktioner.
**Store functions:** `saveContactHistory(db,p,input):Promise<HistoryRevision>`, `saveTimingRules(db,p,input):Promise<TimingRulesRevision>`, `readContactTiming(db,p,input):Promise<TimingReport>`.

- [ ] Write failing real-SQL tests: immutable_revisions; changed_replay_conflicts; one_cas_winner; foreign_owner_denied; empty_tables_block; source_gap_and_date_only_block; refreshed_save_does_not_refresh_through; shared_recipient_consistent; ambiguous_cross_channel_duplicate_blocks; historical_reminder_counts; renamed_invitation_does_not_reset; failed_before_send_not_sent; uncertain_send_blocks; new_inbound_blocks; inherited_suppression_always_wins.
- [ ] Add boundary assertions: `intervalFloorAt - latestObservedOutboundAt = 1209600 seconds`; before boundary blocked, at boundary time blocker absent; repeat with both time changes in Europe/Stockholm. At 901 seconds of source age stale; at exactly 900 allowed if all other conditions pass. A passed time gate still returns `customerSendingEnabled=false`.
- [ ] Extend the labelled disposable DB runner to load exactly one suffix-matched new migration and its SQL tests after existing sales sending setup. Run `node scripts/test-sales-db.mjs` in an already owned local postgres:16 fixture. Expected RED missing table/RPC; do not run against a network database. Runner must retain context/image/label checks and finally-drop only the newly named sales_TIMESTAMP database.
- [ ] Implement immutable ID/version/CAS/request-digest rules, two RLS tables, service-only insert/select, immutable triggers and no update/delete grants. Unique project+recipient+version (history), project+version (rules), project+request-key per operation. Same request/key returns same revision; changed request/key conflicts. No rows inserted by migration.
- [ ] Implement evaluation from one fixed server timestamp per report. Derive recipient from saved contact, normalize exact address and inspect all same-address project contacts plus current inbox/send evidence. Incomplete sources, unknown history, ambiguous duplicates, pending/uncertain send, reply/hold or max-reminder blocker yield false. A historical floor may display only when its events are unambiguous; unknown latest outbound means null. All stored source identities and linked contact versions must still match.
- [ ] Locks: history/rule mutations take existing project `:sales-contact-eligibility` advisory lock first, then recipient keys in sorted order, then current revision/contact rows. Rule save uses same project lock. Read evaluates one consistent SQL statement; caller cannot provide at. Source UI metadata cannot override authoritative stored inbox/send stops. Validate equivalent input again in SQL.
- [ ] Run SQL contracts, store unit tests and migration guard tests. Expected PASS, no PUBLIC/anon/authenticated mutations or RPC execution, zero populated new tables after a clean migration. Record actual generated migration filename and content hash.
- [ ] Commit `feat: persist reviewed contact history and timing rules`.

### Task 3: Fence existing initial preparation against stale timing

**Files:** extend the same not-yet-applied timing migration with replacements of sales_prepare_job/sales_assert_contacts and workspace projection; modify lib/sales/types.ts, view-model.ts, atlas-tools.ts; add scripts/test-sales-timing-races.mjs and lib/qa/sales-timing-integration.test.ts; adapt synthetic setup in affected existing sales integration/SQL fixtures.
**Consumes:** Task 2 SQL evaluation + snapshot assertion.
**Produces:** `SalesWorkspace.timing:TimingReport`; `canPrepareContact(c:SalesContact,timing:ContactTiming|undefined):boolean`; job snapshot includes timing rule/history/contact versions and evaluated source coverage per recipient. Missing timing is false, never legacy fallback.

- [ ] Write RED tests: missing_timing_cannot_prepare; unknown_history_cannot_prepare; idempotent_replay_still_same_job; initial_eligibility_count_matches_actual_server_ids; new_history_or_rule_fences_claim_attempt_and_completion; address_change_fences_old_snapshot.
- [ ] Add two real-session races: concurrent history save vs prepare and concurrent history/rule save vs model-attempt reservation. A permitted attempt must linearize before the mutation or be fenced after it; no stale-version permit, deadlock or double job. Source freshness is checked again at each actionable boundary.
- [ ] Implement timing validation inside existing initial-preparation transaction, after established contact-eligibility lock and before insert. Preserve prior history, suppression, same-address, offer-tier, 1–5 contact and idempotency checks. Save timing versions in snapshot; use assertion in sales_assert_contacts so current claim/attempt/result paths also reject changed/stale timing.
- [ ] Inventory actual worker/job/run lock order before adding assertion locks. New mutations must not need worker/send/run locks while holding timing locks. Add the races to existing owned DB runner; never reorder private send locks or change transport.
- [ ] Attach authoritative timing to sales_read_workspace; compute Atlas initialOutreachEligibleCount and UI selectors from the same returned eligibility. Old initial jobs with no timing cannot receive new model permits; existing saved drafts remain readable and no reply/test-send record changes.
- [ ] Adapt only synthetic fixtures to explicitly save reviewed timing rules/history before successful preparation cases. Re-run old negative regression cases under the final schema too, so “needs timing” cannot mask the behavior each old test intended to assert.
- [ ] Run DB runner + targeted lib/qa/sales-timing-integration.test.ts, sales-workspace-subtotals.test.ts, sales-view-model.test.ts, sales-integration.test.ts. Expected all required DB suites actually execute (not skip), old and new invariant checks PASS.
- [ ] Commit `feat: fence initial draft preparation with current contact timing`.

### Task 4: Owner API and read-only Atlas access

**Files:** create timing/api.ts, atlas-tools.ts and tests; app/api/sales/timing/route.ts; modify lib/sales/atlas-tools.ts registry/dispatch/guide and relevant lib/qa/sales-atlas-tools.test.ts.
**Consumes:** Task 1 parsed inputs, Task 2 store signatures, existing resolveProjectAccess/feature flag/sales_validate_conversation.
**Produces:** `createTimingApi({access,db,enabled})` and `timingApi`; tool `get_sales_contact_timing({projectId,contactIds?})`, registered via existing SALES_TOOLS, with a fixed read handler `readTimingTool(input,p,db):Promise<TimingReport>`.

- [ ] Write RED tests: read no writes; wrong owner/project/conversation denied; model recipient/now/approval/intent overrides refused; same-origin required for writes; GET/POST duplicate or unknown fields refused; absent data stays null; failed RPC returns unavailable rather than zero counts.
- [ ] Implement GET projectId + optional repeated contactId query values (unique, 1–200); POST exact operation save_history or save_rules and whitelisted input. Reuse 65 536-byte readBody and no-store headers. Save requires confirmed=true and expected previous/contact versions, then returns canonical persisted revision plus fresh report.
- [ ] Register Atlas read tool only. Verify name/field routing cannot fall through into prepare_sales_drafts. Require current owned project-bound conversation and existing feature flag. Source strings are untrusted. No new mutation tools, scheduler or generic-record escape hatch.
- [ ] Guide Atlas to report exact blockers/versions/sourceThrough and link workspaceUrl plus #contact-timing. A failed read means unknown; passed floor means review only; requested replies stay in existing selected-message path.
- [ ] Run timing API/tool tests plus sales API/Atlas/report-route unit tests and typecheck. Expected PASS; mocked RPC call lists contain no send/prepare/save operation from a read.
- [ ] Commit `feat: expose owner-reviewed contact timing and read-only Atlas status`.

### Task 5: Collapsible contact history and waiting-time review

**Files:** create components/platform/vnext/sales/SalesContactTiming.tsx; modify SalesWorkspace.tsx + module.css; create e2e/sales-timing.spec.ts; extend e2e/sales-pilot-server.mjs, sales-pilot-entry.tsx and playwright.sales-pilot.config.ts.
**Consumes:** TimingReport and owner API from Task 4; existing contact list and canonical workspace load callback.
**Produces:** `SalesContactTiming({projectId,contacts,initialTiming,onSaved})`; closed-by-default native details section with id contact-timing; selected-contact history metadata form and separately confirmed rule form.

- [ ] Write browser RED cases: section_initially_closed; opening_does_not_write; source_and_offset_visible; unknown_not_zero; old_source_stays_blocked_after_save; changed_tab_revision_conflict; cancel_does_not_save; timing_saved_does_not_change_suppression_or_create_job; rule_confirmation_is_not_send_permission.
- [ ] Render Swedish blocker labels, last observed outgoing, source window, reminder count or “Okänt”, theoretical floor or “Kan inte bestämmas”. Never use “Skickklar”. Show `Kundutskick är inte aktiverade` and manual-mail limitation.
- [ ] Add structured event/source rows and source-window review; include readonly recipient/current contact versions derived from selected contact. Display validation errors before save. Distinguish source matching from provider delivery/consent proof. On conflict retain edit data and require fresh re-review; do not auto-overwrite or silently rebase.
- [ ] Rule form displays values 14 days, 1 reminder and 15 minutes with exact meaning and separate explicit confirmation. Tillåt endast mer försiktiga värden inom Task 1:s intervall. Changing policy does not populate history, unpause contacts or authorize sending.
- [ ] Preserve mounted form state across native collapse/reopen. After successful save load canonical report/workspace; never synthesize allowed state optimistically. Avoid new main navigation.
- [ ] Run `node ../../node_modules/@playwright/test/cli.js test --config playwright.sales-pilot.config.ts`. Expected new cases + existing pilot/inbox/Strato cases PASS, no send API request. Inspect actual desktop and 390px viewport; no horizontal overflow, readable controls/source data.
- [ ] Commit `feat: add collapsible contact timing review in sales workspace`.

### Task 6: Qualify and stage preparation-only delivery

**Files:** create docs/superpowers/verification/2026-10-19-sales-contact-timing.json and regression metadata; update existing draft PR386 and private progress ledger.
**Consumes:** Tasks 1–5; approved design and this plan. Preserves existing private test and all contact holds.
**Produces:** tested preparation control, migration evidence, protected preview and actual Atlas read evidence. No customer send activation.

- [ ] Run owned PostgreSQL suite with timing races, scoped timing/sales/approval/schema tests and `node ../../node_modules/typescript/bin/tsc --noEmit`. Run new and existing affected browser cases. Expected no novel failures; skipped integration is not proof. Use prior recorded full-suite failure identities as baseline and broaden only for unresolved concerns.
- [ ] Perform one independent complete-increment review of contracts, SQL security/locking, UI and Atlas. Resolve Critical/Important findings with named RED→GREEN regressions; no repeated reviewer loop. Preserve source of review and concrete rulings.
- [ ] Verify new migration against current Supabase changelog/docs and current ledger, RLS/ACL/advisors, immutable empty-table state and ordinary migration guard. Apply only the reviewed additive/replacement migration for this deliverable when qualified; no seed rule/history rows and no approval bypass flags. Record exact ledger delta.
- [ ] Pin/inspect protected Vercel preview with ordinary build checks. No merge or production alias promotion; no local worker upgrade required for this server/UI change.
- [ ] On real project, read timing status through API/UI/Atlas without saving rules/history or starting jobs. Expected 139held, missing timing/history reported honestly, zero enabled initial selectors; preserved contact/memory hashes, offers2/initialjobs0/reply1/send1/events4 unless an independently authorized concurrent change is identified.
- [ ] Save metadata-only proof and a safe collapsed/status screenshot. Mark actual results separately from synthetic success; do not claim verified82addresses, continuous Sent/Resend sync or enforced customer dispatch.
- [ ] Update plan checkboxes, PR body and ledger with exact remaining limits. Commit `docs: verify contact timing preparation with customer sending disabled`.

## Self-review and handoff

Spec coverage: intent/no sends (§1/8 → all tasks); source-backed immutable storage/options (§2–5 → Task 1/2); rules and one decision engine (§6 → Task 2/3); Atlas and collapsed owner review (§7 → Task 4/5); scope/security/concurrency (§9 → Task 2–4); proof (§10 → Task 6). All five Review Focus cases have named owning tests.

No separate TS eligibility algorithm, no silently inferred source coverage, no free address parameter, no automatic resets/imports, no change to existing customer holds or private sending. Save APIs cannot convert provider failure or unknown history to a clear status merely by updating observedAt. Timings are recomputed from source through-time and server now.

This is one connected, testable preparation increment, not a general CRM or new customer mail transport. Implementation must read both the approved spec and this plan. Existing inline execution is preserved; review this written plan before product code changes.
