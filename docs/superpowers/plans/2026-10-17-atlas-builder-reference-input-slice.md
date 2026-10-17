# Atlas Byggstudio — bildreferenser, första säkra del (2026-10-17)

Status: **implementerad och lokalt testad grundmodul, INTE aktiverad i användargränssnitt eller produktion.** Isolerad branch `codex/atlas-builder-references-20261017`.

## Varför en separat del behövs

Den godkända femleveransplanen kräver upp till fyra PNG/JPEG/WebP-referenser per tur, högst 10 MiB per bild, verklig typ-/pixelkontroll, EXIF-rensning och därefter ett **privat** kanoniskt AssetId inom rätt projekt. En referens måste först godkännas av servern och kopplas till en behörig konversation innan en AI-modell får se den.

Direkt multipart-POST av upp till 4 × 10 MiB till en vanlig Vercel Function fungerar inte: [Vercel begränsar request bodies till 4.5 MB](https://vercel.com/docs/functions/limitations#request-body-size). Det går inte att lösa med en större klientinställning.

## Implementerat i denna branch

`lib/website-build/assets/normalize-reference.ts` är ett transportoberoende, isolerat normaliseringssteg:

- Kontroll av tillåten MIME **mot faktiska bytes**. SVG, HTML och påhittade format vägras.
- Maximalt 10 MiB, 6 000 px per kant och 16 megapixlar. Skadade filer och överdimensionerade bilder vägras före lagring.
- Använder pinnad `sharp` för riktig dekodning och orienteringskorrigering, inte klientens dimensioner.
- Kodar om till WebP och stryker källans EXIF/ICC/XMP inklusive platsdata; returnerar verifierad dimension och bytes. **Ingen uppladdning, URL, betald modell eller publiceringsbehörighet skapas.**
- Riktade tester med PNG/JPEG/WebP, falsk MIME, SVG, korrupt fil, storleksgränser och roterad EXIF-bild.

## Fortsättning (måste göras innan funktionen kan visas som klar)

1. Ägar-/projekt-/konversationsbind en engångsbiljett till **privat temporär uppladdning** hos Supabase Storage. Klienten laddar bytes direkt till rätt privat staging, med maxstorlek och kort giltighet. Ingen publik bucket.
2. Servern verifierar exakt uppladdningsbiljett, ägare, projekt, konversation, antal (≤4), format/bytes/pixlar och allokering. Läs originalet från staging, kör `normalizeReferenceImage`, lagra **bara det normaliserade** resultatet via befintlig `admitAssetBytes` med `visibility: internal`, radera staging. Kvittera AssetId + hash, inte en offentlig URL. Hantera återspelning, fel, städning och parallella uppladdningar.
3. Ge ägarbunden läsning/thumbnails utan att exponera Supabase service-role. Visa uppladdade referenser bredvid studio-composern och bevara dem vid fel/återupptagning, även vid projektbyte och mobil.
4. Bind referens-AssetId till **exakt chattur och projekt** på servern; multimodalt skickas bara verifierat material till en bildkapabel modell. Avvisa bilagor från en annan konversation, gamla/återkallade projekt, arkiv och ändrade utkast. Verifiera att modellen faktiskt såg bilderna.
5. Utöka arbetsplan, designmockups och färdig byggartefakt med korrekt proveniens, rättighets-/licensbeslut och projektbundet bildmaterial. Ingen betalad GPT Image 2-körning innan adapter, prisbok, hård kostnadsreservation och riktiga kvitton finns enligt ursprungsplanen.

## Säkerhets-/releaseregel

Inga nuvarande globala kod-workflows, iframe-CSP, kostnadsgrindar eller publiceringsgränser får öppnas för bildstödet. Den här grunden är en byggsten och ger **ingen** rättighet till Atlas att använda stationärens terminal, ändra livekod eller skicka bilder till en modell.

Huvudplan: `docs/superpowers/plans/2026-10-14-atlas-builder-studio-rollout.md`. Versionsbunden kvalitetskontroll och inloggat end-to-end-prov krävs för att lyfta Draft → Ready.

## 2026-10-17 – efterföljande serverdel i PR #368 (ej publicerad)

Denna arbetsgren innehåller nu också ett **utkast till hela serverflödet** för privata bildreferenser:
- `POST /api/website-build/references/tickets` autentiserar server-session, same-origin, aktuell ägare/projektstatus och konversationsbindning innan en signerad uppladdningsbiljett skapas. Biljetten har servergenererad exakt path i `atlas-reference-staging`, max 4 stabila slots per utkast och två timmars giltighet. Samma slot+utkast är idempotent och MIME-byte vid återspelning avvisas.
- `POST /api/website-build/references/finish` läser endast den projektspecifika staging-filen, CAS-claimar ticketen (`issued` → `processing`), kontrollerar verklig MIME och pixlar, konverterar till metadatafri WebP, kör befintlig kanonisk privata `admitAssetBytes`, sparar `AssetId` och försöker rensa staging. Redan `ready` ger samma AssetId. Ingen publik URL, AI-modell eller publicering.
- En SQL-proposition finns i `docs/sql/atlas-builder-reference-upload-tickets-proposed.sql`. Den skapar **ny privat staging-bucket med 10 MiB/MIME-gräns** och server-only ticket-tabell med RLS, unika slot-identiteter och tillståndskontroller. Den ligger uttryckligen **inte** i den kanoniska migrationsmappen; den har inte applicerats i produktion eller annan befintlig Supabase-databas. Ett temporärt, nätverksisolerat PostgreSQL 16-test av första DDL-varianten passerade för privat bucket, tvingad RLS och nekad authenticated-läsning. Uppdaterad state/asset-constraint kräver ny isolerad verifiering innan release.

**Status:** Kod och mockade HTTP-/storage-/databastester är lokalt gröna. Ingen verklig signed-upload har provats mot Supabase; API-rutterna saknar tabellen/bucket tills migrationen genomförs. Därför får PR **inte mergas eller deployas**. Kodmodellen är avsiktligt fail-closed.

**Kvar före release:** (1) SQL-säkerhetsgranskning, kostnad/rate limit och ett kanoniskt migrationsbeslut, (2) korrekt hantering/återställning av `processing`-jobb efter serverkrasch samt tidsstyrd rensning av utgångna/orphanade staging-filer, (3) riktiga signerade upload-tester på isolerad Supabase-miljö med 10 MiB och minst ett feltest, (4) UI filväljare/thumbnails och uppladdning utan service-role i klienten, (5) bind AssetId till exakt chattur, säker behörig bildläsning och verkligt bildinput i modellen, (6) budgeterad separat GPT Image 2 och riktig app-preview i senare leveranser. En testad backend betyder inte att Atlas nu kan se bilder i chatten.

Granskningsbar [PR #368](https://github.com/Bumbi190/ai-operating-platform/pull/368).

## 2026-10-17 – crash- och stagingåterhämtning i samma draft (slice 2C)

**Leverans i isolerad branch, INTE aktiverad som driftjobb.** `lib/website-build/assets/reconcile.ts` är en server-only, projektavgränsad underhållsprimitiv. Den har inga HTTP-rutter eller schemaläggare. Framtida anrop måste komma från en explicit behörig worker/operatör och omfattas av samma projekt-/stopp- och kostnadsregler.

- En `processing`-biljett får inte överges eller automatiskt starta ett nytt bildjobb utan bevis. Först efter 15 minuter kontrolleras faktisk biljettversion, korrekt projekt och exakt privat Asset-lagringsväg.
- Finns ett kanoniskt Asset med exakt samma projekt, skyddad bucket, path och `asset_provenance` (`purpose=atlas-website-reference`, samma `ticketId`), återkopplas det tidigare AssetId. En möjlig kanonisk orphan i lagringen eller felaktig proveniens kräver **manuell granskning** — filen tas inte bort och inga extra Assets skapas.
- Bara när både Asset-rad och exakt kanonisk fil saknas avvisas en gammal `processing`-biljett. Utgångna `issued`-biljetter städas **först en timme efter den två timmar giltiga uppladdningstoken**. Tombstones och deras bevisrader bevaras.
- `staging_cleaned_at` i SQL-propositionen hindrar en permanent omstädningsloop. Sweep läser högst 20 rader, i ett explicit projekt, åt gången. Inga globala oavgränsade lagringsrensningar.
- Förslaget har också en DB-kvot som med serialiserat rådgivande transaktionslås spärrar biljett nr 31/timme eller nr 201/dygn per ägare även vid samtidiga skapandeförsök. API mappas till 429 utan att exponera innehåll.

**Testbevis:** 85/85 riktade lokala Vitest-testfall godkända inklusive tidigare bild-asset-behörigheter, återhämtning och HTTP. Full TypeScript körs på denna ändring. Ny disposable nätverksisolerad PostgreSQL 16-körning applicerade förslagets DDL och bekräftade tvingad RLS, nekad authenticated-läsning samt 30/timgränsen (31:a INSERT stoppades); testcontainern borttagen. Ingen produktionsmigration, cron, betalt modelljobb eller ny ägarbudget.

**Återstående risk/krav:** En recoverysweep gör ännu inte ordinarie jobb själv; verklig Supabase-integrationsverifiering, autentiserad worker-aktivering, cleanup vid externa fel, samtidig finalizer-kraschtest mot real DB, front-end bildväljare, privat läsning, multimodal chattur och licenskontroll återstår. Det här är inte en levererad produktfunktion förrän de är verifierade och granskade.


## 2026-10-17 – nästa etapp: UI för referensbilder i Atlas Byggstudio

**Status: implementerad i isolerad arbetsgren, lokal test, avstängd som standard. EJ mergad, EJ produktionsaktiverad.**

Följande kod har tillkommit ovanpå tidigare draft PR #368:

- `components/website-build/StudioReferenceUploads.tsx` och CSS: en ren bildpanel i arbetsytans **Filer-flik**. Mobil/dator får filväljare för PNG/JPEG/WebP (max 4 bilder och 10 MiB/st), lokal bildförhandsvisning, uppladdningsstatus och användarstyrd rensning av urvalet. En sparad bild beskrivs uttryckligen som *privat sparad, inte skickad till Atlas AI*.
- Panelen använder serverns projektspecifika tidsbegränsade biljett, överför filen direkt från **Supabase browser client** med `uploadToSignedUrl` och begär en separat serververifierad finalize som returnerar AssetId. Service-role-nyckeln finns aldrig i klienten. Inga betalda modell-, publicerings- eller bildgenereringsanrop.
- Serverns `/api/website-build/references/tickets` kan GET-rapportera tillgänglighet för vald konversation. Båda POST-rutterna och statusen använder `referenceUploadEnabled()`; `ATLAS_REFERENCE_UPLOAD_ENABLED` är **false** utan explicit aktivering. Därmed kan UI-funktionen finnas i kod utan att gissa att databas/bucket är färdig.
- Bildpanelen mountas bara när rätt `studioProject.id` matchar chattens projekt. File-subträdet hålls monterat i `StudioLayout` när man byter till Chatt/Preview så lokalt urval och pågående uppladdning inte tappas vid ett normalt flikbyte. Full navigation/unmount avbryter lokal begäran och återkallar blob:preview-URL:er; servern står för slutlig cleanup.
- UI tillåter användaren att rensa urvalet och starta ett nytt draftId för nya försök, utan att radera redan sparade privata Assets. Ingen dold automatisk omkörning.
- Lokala SSR-/server-HTTP-tester bekräftar att uppladdning är blockerad före aktivering, att GET avrapporterar disabled, att otillåtna POST avvisas utan privilegierad DB-kontakt och att filpanelen förblir monterad vid flikbyte.

**Samlad verifiering denna etapp:** 90/90 riktade Vitest-tester (inklusive canonical media admission, tidigare ticket/finalize/recovery och tre nya UI-fall) och `tsc --noEmit -p tsconfig.json` PASS på Windows. Det är **inte** en fysisk Android-testning, server-rendering endast för UI-testet, och ingen signerad uppladdning har körts mot ett verkligt Supabase-projekt.

**Aktiveringsblockerare:** Supabase-kontot har inget separat isolerat Omnira-testprojekt; produktion används därför inte för provuppladdning och inga schemamigreringar appliceras. Före release: granska SQL, skapa isolerad testmiljö och validera Storage+RLS+multi-device/telefon, säkra privat bildhämtning över omstarter, skapa en exakt konversations-/chattur-referenskoppling och ett kontrollerat multimodalt modelltest. Filpanelen är en första preview, **inte** en färdig bildbilaga i Atlas-chatten. `ATLAS_REFERENCE_UPLOAD_ENABLED` ska förbli off fram till godkänd och verifierad miljö.


## 2026-10-17 – privat återläsning av bildreferenser (nästa draft-etapp)

**Funktion i kod, ej påslagen i produktion.** I den befintliga privata bildreferensuppsättningen finns nu också:
- `GET /api/website-build/references/library`: ger högst 40 redan färdigställda referensers ID och tid för exakt behörig projektägare/konversation. Den lämnar aldrig ut lagringsväg, public URL eller service_role-uppgifter.
- `GET /api/website-build/references/image`: läser binär WebP först efter upprepad kontroll av inloggning, aktivt projekt, exakt ticket-ID, ägare, konversation, ready-state, kanonisk privat Asset-rad, kontrollerad förväntad filväg, uppladdad proveniens med samma ticket-ID, format, storlek och innehållets SHA256-hash. Efter nedladdningen kontrolleras den aktuella projektbehörigheten igen. Svaret är `image/webp`, `private,no-store`, `nosniff` och strikt CSP. Inga permanenta eller tillfälliga Supabase-read-URL:er lämnar servern.
- `StudioReferenceUploads` hämtar ID-listan när capability är verifierad och visar sparade bilder igen via denna privata appväg efter omladdning; nytt uppladdat AssetId förs in i listan direkt. Funktionen är fortfarande spärrad bakom `ATLAS_REFERENCE_UPLOAD_ENABLED` och har ingen koppling till AI-modell eller bildgenerering.

**Verifiering:** riktade autentiserings-/förrädiska queryparametrar-/falsk lagring-/hash-testfall samt SSR/UI. Sammanlagt 100/100 riktade Vitest i 10 filer på isolerad Windows-worktree, TypeScript-check separat. Ingen verklig Supabase Signed Upload mot en fristående instans utförd, ingen mobil interaktiv E2E eller databasmigration till produktion. Befintliga lokala Supabase-containrar på stationären tillhör andra pågående arbeten och användes inte för denna körning.

**Innan merge/aktivering:** omfatta hela konversationens kvitton, integrera referens-AssetIds till exakt chattur med korrekt multimodal model-invocation, validera signering/Storage på isolerad självständig Supabase-instans, säkerhets- och rullningsgranskning samt manuellt godkännande av databas/feature flag. Ingen driftsättning eller nya kostnader i denna PR.


## 2026-10-17 – beständiga och behörighetsstyrda referensbilder

**Fortfarande isolerad draft PR #368; inga ändringar av produktionsdatabas eller aktivering.**

- `GET /api/website-build/references/library` listar enbart högst 40 sparade opaque ticket-/Asset-id:n och tidsstämplar för den valda **ägda aktiva** konversationen. Inga storage-sökvägar eller publika URL:er lämnas ut.
- `GET /api/website-build/references/image` hämtar bildbytes via serverns befintliga privata `media-assets-private` bucket, först efter behörighet, rätt projekt och konversation, `ready`-biljett, exakt kanonisk Asset-path, lämpligt WebP-format/storlek, oföränderlig uppladdad proveniens med samma ticket-ID och SHA256-integritet. Behörigheten återkontrolleras även *efter* lagringsläsningen. Den levererar enbart `image/webp` med `private,no-store`, `nosniff` och strikt CSP.
- `StudioReferenceUploads` kan återläsa användarens tidigare sparade bilder efter omladdning med denna privata läsväg, och uppdaterar listan omedelbart efter en lyckad finalize. Bilderna kan ännu **inte** bindas till Atlas AI-meddelanden eller skickas till en bildkapabel modell. Alla läs- och skrivrutter ligger fortfarande bakom `ATLAS_REFERENCE_UPLOAD_ENABLED`, avstängd som standard.
- Nya lokala tester omfattar öppna/okända/duplicerade queryfält, otillåten ägare/projekt, felaktig status, publik/felaktig lagring, bruten proveniens, korrupt bildhash och återkallad ägarbehörighet medan servern hämtar bytes.
- Denna lokala etapp ger totalt **101/101 riktade Vitest-testfall** inom bildflödet och angränsande asset admission plus godkänd TypeScript-check. Den bevisar inte verklig Supabase Storage eller Android-interaktion.

**Nästa blockerare:** en **separat isolerad** Supabase Storage-miljö med verkligt signerat upload, RLS-/migrationsgranskning och sedan explicit koppling mellan privat AssetId och exakt chattur, verifierad multimodal konsumtion och godkänd flaggaktivering. Befintliga lokala Supabase-kontainrar från andra parallella arbeten har inte återanvänts eller förändrats.


## 2026-10-17 – riktig isolerad Supabase Storage-integration

**Status: PASS för verklig Storage-kontraktstest i lokal *disposable* Supabase CLI-instans. Inte full Atlas-chat-E2E, inte produktionsrelease.**

- Startade eget `supabase init` i `C:\Users\Andre\Projects\Omnira\Temp\atlas-reference-sandbox-20261017`, projekt-id `atlas-reference-sandbox-20261017`, med egna lokala portar 56321 (API) / 56322 (DB). Därmed rördes inte de existerande lokala `omnira-stt-local`- eller `Handlarborsen`-projekten. Installerade inga credentials i repot.
- Applicerade `docs/sql/atlas-builder-reference-upload-tickets-proposed.sql` **enbart lokalt** på ny Supabase Storage/Postgres efter tre minsta test-only FK-tabeller i separat sandbox. Verifierade verkliga `storage.buckets`: privat `atlas-reference-staging`, max 10 MiB och allowlist PNG/JPEG/WebP samt RLS/ticket-tabell.
- Testade direkt mot riktig lokal Storage API via `@supabase/supabase-js`: service-role utfärdade `createSignedUploadUrl`, vanlig anonym/publishable klient lyckades med `uploadToSignedUrl` av riktig PNG, token vägrades för annan path, dubbelt uppladdningsförsök vägrades, anonym `download` vägrades, förutsägbar `public`-URL vägrades, service-role `download` gav identiska PNG-bytes, och upload över 10 MiB blockerades på bucketnivå. Testobjekten rensades via service-role; alla påstådda kontroller gick igenom.
- **Viktigt:** Lokala Supabase CLI-tjänster använder gemensamma utvecklingsnycklar och lyssnar mot `0.0.0.0`. Just denna isolerade stack stoppades efter genomgången med `supabase stop --project-id atlas-reference-sandbox-20261017 --no-backup`; befintliga andra lokala DB-container var kvar. Kör inte dev-stacken med verkliga hemligheter eller för trafik från internet.
- Uppföljningen är reproducerbar med `apps/web/scripts/reference-storage-local-smoke.mjs`, som vägrar körning utan `ATLAS_REFERENCE_TEST_MODE=isolated-local` och verifierad `http://127.0.0.1:<port>`/localhost, läser lokala testnycklar endast från miljövariabler, skriver aldrig ut nycklar och städar testobjekten. Node syntaxcheck pass.
- För återkörning: skapa NYT separat projekt via `supabase init`, sätt **unika** lokala portar, starta en minimal lokal CLI-stack, applicera SQL-propositionen i just dess databas (tillfälliga `public.projects`, `public.conversations`, `public.assets` krävs för FK i en tom sandbox), hämta `API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY` från **endast denna** instans status-JSON till processens miljövariabler `ATLAS_REFERENCE_TEST_URL`, `ATLAS_REFERENCE_TEST_ANON`, `ATLAS_REFERENCE_TEST_SERVICE`, sätt `ATLAS_REFERENCE_TEST_MODE=isolated-local` och kör `node apps/web/scripts/reference-storage-local-smoke.mjs`. Avsluta med `supabase stop --project-id <det-exakta-sandbox-id:t> --no-backup`. Använd aldrig `--all`.
- **Gräns:** vi har verifierat provider-kontraktet, men inte hela Atlas-inloggade owner-route → ticket table → binary normalize → canonical Asset insert → privat bildläsning och chattur som en sammanhängande fysisk körning. Det kräver en mer representativ lokalt seedad Omnira-databas, verkliga Auth-sessioner och browser-/Android-test. Featureflaggan `ATLAS_REFERENCE_UPLOAD_ENABLED` förblir OFF och PR #368 förblir draft.
