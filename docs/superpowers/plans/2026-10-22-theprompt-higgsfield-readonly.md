# Higgsfield MCP: läsbar anslutning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operatören kan ansluta Higgsfield för ett eget projekt och läsa saldo samt en videooffert utan att skapa generationer.

**Architecture:** En separat servermodul kapslar in OAuth, krypterad projektlagring och en strikt begränsad MCP-klient. Befintliga operatörs- och projektkontroller skyddar alla routes; en liten inställningspanel använder enbart dessa routes. Genereringsregistret och dagliga mediecrons berörs inte.

**Tech Stack:** Next.js 14.2.29, TypeScript, Node >=20, Supabase Postgres, node:crypto AES-256-GCM, @modelcontextprotocol/client 2.3.1, Vitest 2.1.9.

**Spec:** docs/superpowers/specs/2026-10-22-theprompt-higgsfield-video-design.md (godkänd av André 2026-10-22).

## Global Constraints

- Första leveransen gör inga betalda anrop och aktiverar inga genereringar, crons eller publiceringsändringar.
- MCP-servern är fast: https://mcp.higgsfield.ai/mcp. Ingen automatisk växling till dollar-API.
- Endast projektets behöriga operatör kan koppla, se status eller koppla från.
- Tokens lagras krypterat på serversidan; befintliga sociala tokens ändras inte.
- Callback matchar initiativtagare, projekt, server och state; state är kortlivad och får användas en gång.
- Följande målbild ingår INTE i implementationen: 20 krediter/reel, 40/svenskt dygn, 1000/rullande 30 dygn, 100 i reserv, videogenerering, videorendering och lokal export.
- Ingen databasaktivering eller produktionsdeploy ingår automatiskt i en kodändring.

## Review Focus

1. Förfalskad request-host eller ändrade discovery-URL:er får inte läcka verifierare, klienthemligheter eller tokens: Task 1 och 3.
2. Dubbla callbacks och en callback efter frånkoppling får inte återuppliva anslutningen: Task 2 och 3.
3. Samtidig token-refresh får inte skriva över nyare credentials eller skapa flera refresh-anrop: Task 2 och 4.
4. Nya verktygsnamn, schemasvängningar och inbäddade mediereferenser i en prisförfrågan får inte öppna genereringsvägen: Task 4.
5. Nekad inloggning, saknad krypteringsnyckel eller saknade DB-tabeller måste ge begriplig status utan att störa befintliga inställningar: Task 3 och 5.

## Verifierade planeringsunderlag

Läsning utan autentisering, 2026-10-22:
- MCP svarar 401 och hänvisar till /.well-known/oauth-protected-resource/mcp.
- Resource metadata anger resource https://mcp.higgsfield.ai/mcp och authorization_servers [https://clerk.higgsfield.ai].
- Clerk metadata anger issuer https://clerk.higgsfield.ai, /oauth/authorize, /oauth/token, /oauth/register, /oauth/token/revoke och S256.
- Root-metadata på mcp.higgsfield.ai annonserar också en annan issuer. Följ den resource-bundna hänvisningen till Clerk; använd inte root-proxyn som automatisk fallback.
- Scopes begränsas till openid email offline_access, annonserade av resource. Begär inte private_metadata eller org-behörigheter.
- Npm verifierar @modelcontextprotocol/client 2.3.1 med Node >=20. SDK 2 använder andra imports än det äldre @modelcontextprotocol/sdk 1.x.
- Autentiserad verktygskatalog är ännu inte läst av Omnira. Balans/modell/prisnamn nedan är förväntade kandidater, inte bevis att varje MCP-serverversion exponerar dem.
- Fullständig liveanslutning kräver operatörens OAuth-inloggning efter att kod, schema och miljökonfiguration finns.

## Filkarta

Ny modul: apps/web/lib/media/higgsfield/{types,config,crypto,store,oauth,client,readiness}.ts.
Nya routes: apps/web/app/api/media/higgsfield/{oauth/start,oauth/callback,status,inspect,disconnect}/route.ts.
Ny panel: apps/web/components/platform/vnext/SettingsHiggsfieldConnect.tsx.
Ändra enbart inställningsmonteringen i apps/web/components/platform/vnext/SettingsSurface.tsx.
Ny migration skapas med CLI: apps/web/supabase/migrations/<CLI-timestamp>_higgsfield_mcp_readonly.sql.
Nya tester: apps/web/lib/qa/higgsfield-{config,crypto,store,oauth,routes,client,settings}.test.ts och apps/web/supabase/tests/higgsfield_mcp_readonly.sql.
Paketändringar: apps/web/package.json och rotens package-lock.json.
Driftnotering: docs/theprompt-higgsfield-readonly-runbook.md.

### Task 1: Protokollgräns och låst klientberoende

**Files:** types.ts, config.ts, higgsfield-config.test.ts, package.json och package-lock.json enligt kartan.
**Interfaces:** exportera HIGGSFIELD_MCP_URL, HIGGSFIELD_ISSUER, resolveHiggsfieldConfig(env): ConfigResult och assertHiggsfieldUrl(url, purpose): URL. ConfigResult är ok med redirectUri/encryptionConfigured eller refused med en sluten kod. Definiera ConnectionStatus = disconnected | connected | reconnect_required | unavailable och serialiserbara saldo/offerttyper utan tokens.

- [ ] Skriv test assertHiggsfieldUrl: tillåt enbart MCP-resursens origin för transport/resource discovery och Clerk-origin för issuer/auth/token/register/revoke/userinfo/JWKS; avvisa credentials i URL, fragment, HTTP utanför uttrycklig lokal utveckling, annan port, subdomänliknande namn och HTTP-redirect till annan origin.
- [ ] Skriv configtest: saknad eller ogiltig HIGGSFIELD_OAUTH_REDIRECT_URI vägrar start; tillåten sökväg är /api/media/higgsfield/oauth/callback. Härled aldrig redirect från request-host. HIGGSFIELD_MCP_ENABLED är false om inte exakt true/1.
- [ ] Kör npx vitest run lib/qa/higgsfield-config.test.ts från apps/web; verifiera väntade nya testfel.
- [ ] Installera låst @modelcontextprotocol/client@2.3.1 i apps/web-workspacen. Implementera gränsen med SDK 2-imports enligt dess versionsbundna dokumentation; ingen egenskriven MCP-transport.
- [ ] Kör samma tester och verifiera PASS samt npm dependency tree utan saknade peers. Commit: feat(media): pin Higgsfield MCP read-only protocol boundary.

### Task 2: Krypterad lagring och atomiska tillstånd

**Files:** crypto.ts, store.ts, higgsfield-crypto/store.test.ts och CLI-skapad migration/SQL-test.
**Interfaces:** sealProviderPayload(context, value): SealedPayload och openProviderPayload(context, envelope): unknown; context innehåller projectId, recordKind, recordId. Store erbjuder createOAuthAttempt(input), consumeOAuthAttempt(stateHash, actorId, now), readConnection(projectId), saveConnectionCAS(input), acquireRefreshLease(projectId, version), releaseRefreshLease(lease) och disconnectConnection(projectId).

- [ ] Skriv kryptotest: AES-256-GCM rundtur; ändrat projectId, recordKind, recordId, ciphertext eller tagg vägrar; saknad/felaktig 32-byte base64nyckel vägrar och ger aldrig plaintext/logg.
- [ ] Skriv storetest: state förbrukas exakt en gång efter rätt actor/project-kontroll, går ut efter 10 minuter och sparas bara som SHA-256. Två olika tillåtna operatörer kan inte konsumera varandras state.
- [ ] Kör fokuserade tester, verifiera RED. Läs aktuell Supabase-changelog/docs före schemaimplementation och inspektera relevanta existerande tabeller.
- [ ] Skapa migration via supabase migration new higgsfield_mcp_readonly. Skapa media_provider_connections (projekt/provider/connection_version, krypterad registrering+tokens, issuer, subject, status, refresh-lease och timestamps) samt media_provider_oauth_states (state_hash, project_id, actor_id, connection_version, encrypted_payload, expires_at, consumed_at).
- [ ] Aktivera RLS utan klientpolicyer och återkalla ALL från PUBLIC/anon/authenticated; ge service_role minsta nödvändiga tabell- och RPC-behörigheter. Tillstånds-RPC:er är SECURITY INVOKER och EXECUTE är återkallat från publika roller. Ingen ändring av platform_tokens.
- [ ] Implementera CAS så frånkoppling ökar version, rensar credentials och förbrukar tidigare väntande state i samma transaktion. Ny anslutning/refresh får bara skriva till väntad version. Lease för refresh är 30 sekunder; ingen annan får förnya innan den släppts eller gått ut.
- [ ] SQL-test: anon/authenticated nekas SELECT/INSERT/UPDATE/DELETE på båda tabeller; service_role kan bara utföra de avsedda transaktionerna; dubbla callbacks och disconnect/callback-race lämnar högst en giltig anslutning.
- [ ] Kör Vitest och SQL-test i isolerad lokal DB. Kör schemaadvisors och migrationskontroll, dokumentera faktisk utdata. Commit: feat(media): persist encrypted Higgsfield OAuth state.

### Task 3: OAuth-service och skyddade routes

**Files:** oauth.ts, readiness.ts, oauth/start och oauth/callback-routes, higgsfield-oauth/routes.test.ts.
**Interfaces:** beginHiggsfieldConnection({projectId, actorId}): Promise<{authorizationUrl}>; finishHiggsfieldConnection({state, code?, error?, issuer?, actorId}): Promise<ClosedOutcome>; readHiggsfieldConnectionStatus(projectId): Promise<SafeConnectionStatus>. Endast slutna koder går till webbläsaren.

- [ ] Skriv route-test: resolvePlatformOperator + resolveProjectAccess + assertProjectAllowed körs före providerkontakt. Oinloggad ger 401, icke-operatör/annat projekt 403, felaktig JSON/UUID 400 och avstängd/saknad config 503.
- [ ] Skriv callback-test: rätt session krävs, state har 10 minuter/ett bruk, denial konsumerar endast behörig state utan tokenexchange, fel issuer vägrar, parallella callbacks byter högst en kod och disconnect under exchange förhindrar credentials-write.
- [ ] Kör båda testerna och verifiera RED.
- [ ] Implementera OAuthClientProvider med persistent state/discovery/client information bunden till project+actor+issuer+connection_version. Följ SDK-discovery från resource metadata till Clerk, PKCE S256 och dynamisk registrering. Authorization code, verifierare och klienthemlighet lagras aldrig okrypterat.
- [ ] Använd ett URL-kontrollerande fetch med 10 sekunder/anrop och 25 sekunder totalbudget, redirect=error; inga tokens skickas vid discovery/registrering. Id-tokenclaims får inte användas efter enbart avkodning. Bind subject via autentiserad userinfo från annonserat OIDC-metadata; ofullständig identitet ger identityVerified=false och aldrig genereringsbehörighet.
- [ ] POST start returnerar endast authorization_url. GET callback kräver query response mode och återvänder med 303 till serverkonfigurerat /settings?project_id=<id>&higgsfield=<closed-code>, Cache-Control:no-store och Referrer-Policy:no-referrer. Begär inte form_post; ny browser-session för callback kräver ny start.
- [ ] Kör testerna gröna, inklusive ändrad request-host och providerfel med hemlig sentinel; ingen sentinel får förekomma i response/logg. Commit: feat(media): add project-bound Higgsfield OAuth routes.

### Task 4: Begränsad läsklient, refresh och frånkoppling

**Files:** client.ts, status/inspect/disconnect-routes, higgsfield-client/routes.test.ts.
**Interfaces:** inspectHiggsfield({projectId}): Promise<SafeInspection>; quote input är låst till grok_video_v15_lite, duration=4, resolution=720p, aspect_ratio=9:16, count=1 utan medias. SafeInspection innehåller endast status, creditBalance, quoteCredits, observedAt och verifierad subjekt/workspace-metadata. Ingen generell callTool-route skapas.

- [ ] Skriv klienttest: upptäck katalog med tools/list, tillåt endast exakt verifierade balance, models_get och estimate_video_cost. Kontrollera struktur/schema innan callTool. Om något namn/schema inte matchar, rapportera unsupported_server_schema; försök inte generate_video med get_cost.
- [ ] Skriv test som instrumenterar all utgående trafik: generate_video, köp-, folder-, upload- och kontomuterande verktyg ger exakt noll anrop även vid instruktioner i servertext eller extra inkommande JSON-fält.
- [ ] Skriv refresh/disconnect-test: 401 ger högst ett refresh-försök under DB-lease, parallell läsare inväntar/återkommer utan andra refresh. Ogiltig refresh markerar reconnect_required med CAS. Frånkoppling invaliderar lokalt först; provider-revocation är best effort, återställ aldrig tokens efter fel.
- [ ] Kör testerna och verifiera RED; implementera MCP-client med stängning i finally och begränsning 1 MiB/utgående JSON-resultat, 20 sekunders totalbudget. Tillåt inte serverinitierad sampling, elicitation eller andra klientverktyg.
- [ ] Verifiera saldo/offert som ändliga icke-negativa kredittal från structuredContent eller en ensam strikt JSON-text. Godta inte instruktionstext eller numeriska strängar som pris. Modell/schema kan läsas utan mediereferenser. Saknat workspace får inte beskrivas som verifierat konto/workspace för betald dispatch.
- [ ] GET status läser endast lokal säker metadata. POST inspect gör de tre begränsade läsningarna och får återanvända giltig token. POST disconnect tar samma serverbaserade operatör/projektkontroller och same-origin CSRF-kontroll som start/inspect.
- [ ] Kör Task 1–4-tester gröna och bevisa att saldo 0 kan läsas utan att trigga påfyllning. Commit: feat(media): expose read-only Higgsfield account inspection.

### Task 5: Projektpanel i befintliga inställningar

**Files:** SettingsHiggsfieldConnect.tsx, SettingsSurface.tsx, higgsfield-settings.test.ts.
**Interfaces:** SettingsHiggsfieldConnect({projectId, canManage, outcome?}); panelen använder bara fasta routes. Status: Inte ansluten / Ansluten / Anslut igen / Tillfälligt otillgänglig. Knappar: Anslut Higgsfield, Läs saldo och testpris, Koppla från.

- [ ] Skriv komponenttest: varje knapp skickar rätt project_id; fel projekt och canManage=false ger ingen kontokontroll; två snabba klick ger högst en in-flight request; saldo/pris visas med observedAt och tomt värde kallas okänt, inte noll.
- [ ] Skriv test: saknade tabeller/config ger Tillfälligt otillgänglig i Higgsfield-panelen, men övriga sociala inställningar renderas. Rendera ingen token, verifierare eller rå providertext.
- [ ] Kör testerna RED; implementera panelen separat och montera i respektive ägt projektblock i SettingsSurface. Ladda panelstatus via egen skyddad route så den inte blockerar settings-loadern. Ingen ändring av legacy settings krävs för denna första vNext-panel.
- [ ] Följ endast start-route-URL vars origin är exakt https://clerk.higgsfield.ai. Callback visas med sluten översättning. Visa: Anslutningen kan bara läsa saldo och pris. Videogenerering är inte aktiverad.
- [ ] Kör testerna gröna och gör en browserkontroll i vNext med fejkade/nekade svar. Commit: feat(settings): add read-only Higgsfield project connection panel.

### Task 6: Samlad verifiering och driftunderlag

**Files:** docs/theprompt-higgsfield-readonly-runbook.md och befintliga nya tester.
**Interfaces:** dokumenterad miljökonfiguration och reproducerbar verifiering; inga produktionshemligheter i filer.

- [ ] Kör från apps/web: npx vitest run lib/qa/higgsfield-config.test.ts lib/qa/higgsfield-crypto.test.ts lib/qa/higgsfield-store.test.ts lib/qa/higgsfield-oauth.test.ts lib/qa/higgsfield-routes.test.ts lib/qa/higgsfield-client.test.ts lib/qa/higgsfield-settings.test.ts; alla ska PASS.
- [ ] Kör lokal Supabase SQL-test för nya tabeller och rådgivare. Kör npm run typecheck och npm run build --workspace=apps/web med korrekt installerade beroenden. Redovisa befintliga fel separat; kalla inte ofullständig build godkänd.
- [ ] Kontrollera git diff mot basen: inga media/cron-, SimpleNewsReel-, provider-registry- eller social-tokenförändringar.
- [ ] Skriv runbook: HIGGSFIELD_MCP_ENABLED, HIGGSFIELD_OAUTH_REDIRECT_URI och MEDIA_PROVIDER_OAUTH_ENCRYPTION_KEY; skapa nyckel via säker driftskonfiguration, aldrig i chatten. Migreringsordning, rollback (disable flag, disconnect) och OAuth-operatörens enda inloggningssteg.
- [ ] Dokumentera live-smoke: saldo före, en låst testoffert, saldo efter, inga skapade jobb; saknas rätt kontoauktorisering lämnas smoke uttryckligen ej utförd. Ingen produktion deployas eller migreras av testkommandot.
- [ ] Genomför separat kodgranskning före merge och åtgärda blockerande fynd. Lägg ändringen i draft-PR med exakt verifieringsstatus.
- [ ] Commit: docs(media): document Higgsfield read-only connection rollout.

## Självgranskning och överlämning

Planen täcker godkänd designs första leverans; varje senare mål är uttryckligen avgränsat. Alias för verktyg gissas inte vid driftsättning, nycklar loggas inte, resource-bunden issuer går före root-proxy, och disconnect kan inte ångras av sen refresh/callback.

Rekommenderad exekvering: Native. Jag genomför de sex beroende uppgifterna i samma session och låter en separat granskare kontrollera hela ändringen före merge. Alternativ: subagent-driven med separat implementerare och granskare per uppgift; fler kontextstarter och högre granskningskostnad.

Kvar före produktkod enligt arbetsflödet: André granskar denna implementationsplan och väljer Native eller subagent-driven. Inga implementationstester är körda ännu; detta är ett planeringsdokument.
