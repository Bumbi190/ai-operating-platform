# Ägarväg för den godkända Selftest-piloten

André godkände pilotkonfigurationen2026-10-17 kl19:36Stockholm. Migrationerna har därefter lagts in med exakt granskad SQL-hash och158 ledgerposter;15tabeller har RLS och inga interna funktioner har klient-EXECUTE. Previewcff3552 är READY genom den vanliga migrationskontrollen. Normal webbinloggning är nu verifierad: Andre-kontot når AUDIT0b Omnira Selftest. Ingen enhet, nyckel, admission eller GPU-körning har ännu aktiverats i produktion.

Operativ lucka: de befintliga ägar-API:erna har ingen parkopplingsvy. Kompletteringen använder samma operatörs-/projektkontroller och samma API:er för att registrera en offentlig CNG-nyckel, kontrollera dess fingerprint efter separat proof-of-possession, godkänna enheten, medge exakt godkänd syntetisk hash med reviewMode human och återkalla enheten. Den skapar inga privata nycklar i webbläsaren, kopierar ingen session och startar ingen datorprocess.

Ägarvyn `/settings/local-models` kräver både vanlig verifierad operatörsinloggning, faktiskt projektägarskap, ATLAS_LOCAL_TEXT_ENABLED=true och ett explicit ATLAS_LOCAL_TEXT_PILOT_PROJECT_ID. Den senare ska endast vara Selftest4a1d83c9-09dc-4f3b-902e-67284588352b i denna aktivering. Ingen ny meny eller annan projektvy ändras.

Ett litet POST `/api/local-text/pilot` kör den befintliga Atlas-tool-requestvägen direkt, så ett betalt huvudmodellanrop inte behövs för anslutningsprovet. Det kräver samma-origin JSON, begränsad body, verifierad operatör, explicit pilotprojekt, ägd konversation i exakt samma projekt och en UUID-försöksnyckel. Källtext, etiketter, modell, data-/budget-/reviewauktoritet kan inte väljas av klienten. Källan är enbart ”Jag behöver hjälp att återställa mitt lösenord.” med support/annat; den befintliga kvalificeringen och admissionen bestämmer fortfarande om jobbet får köas. En privat serverbegränsning humanReviewOnly gör att denna väg vägrar om mänsklig admission saknas, även om en betald molnprofil skulle kvalificeras senare. Vanliga Atlas-anrop behåller befintlig policy.

Resultatet visas genom samma ägda, expirerande kvittokomponent och granskningen sker genom den befintliga Granskningar-vyn. Webbläsaren sparar endast en tidsbegränsad kvittolokator i flikens sessionsminne, aldrig källtext/svar/nyckel/credentials. Inga affärsåtgärder, notifieringar eller betalda modellroller läggs till.

TDD: den nya pilotgränsens sju tester observerades först röda. Testerna vägrar saknad flagga/projekt, fel operatör/origin/projekt/konversation, extra text/behörighetsfält och överstor body, samt bevisar exakt syntetisk inputhash. En separat regression bevisar att human-only inte får falla vidare till en kvalificerad betald profil. Hela nya ägarbryggan får en smal oberoende kodgranskning; det är ny kod och ingen upprepad granskning av den tidigare färdiggranskade integrationen. Worker-/adapter-/modellfilerna ändras inte; deras kvalificerade SHA måste fortsatt matcha.


## Independent owner bridge review and retry closure

The fresh reviewer reported zero Critical, one Important and one Minor. Important I1: a server-committed request followed by a lost acknowledgement and page remount could create a second job identity. Fixed in the single permitted fix pass: the client durably stores project/conversation/idempotency UUIDs before dispatch, reads them back, and reuses them across uncertain replies and remounts. Storage failure refuses dispatch. An expired unknown request erases those identifiers and leaves a non-content hold marker; it never authorizes a replacement inference. Three regression tests observed RED (missing controller), then GREEN, including server commit/lost response/remount with exactly one job. Session storage contains expiring metadata only, no source/result/private key. Completed receipt metadata is saved before pending state is removed.

Final: minor (deferred): API refusal and panel error messages do not yet expose actionable reconciliation guidance. The earlier receipt refresh Minor remains deferred; reload obtains current owned receipt after human approval.

Final: Ruling: reviewer declined prior integration/SQL/worker/approval internals — the completed original independent review and exact pinned worker bytes remain authoritative; no duplicate review or 225-case rerun. Cost if wrong: inherited defects outside this small bridge; existing integration and SQL evidence remains required.

Final: Ruling: reviewer declined actual production enrollment/inference/cost proof — no such proof is inferred from code review; complete normal owner pilot separately before claiming live readiness. Cost if wrong: an unverified live capability could be advertised.

Final: Ruling: reviewer declined independent full-suite/typecheck execution — author executes and records actual results, including pre-existing failures, without claiming a green full suite. Cost if wrong: regression attribution could be incomplete.

Final: Ruling: reviewer declined hypothetical future catalog expansion — this release permits one fixed qualified 9B classification and human review only; expansion requires its own evidence. Cost if wrong: future changes could bypass today's assumptions; the server human-only fence remains mandatory.

Final: Ruling: expired unknown client state retains only a version/expired-hold marker after erasing conversation/request identifiers — deleting the marker would permit accidental replacement work without reconciliation. Cost if wrong: a tab needs manual operator recovery; no content is retained by this marker.

Persistent Windows identity prepared once: device b846d8e8-c1c0-4838-9ddf-3604c4b505eb, key 68f7fbc5-363c-487b-96cb-3f6080404ee9, fingerprint b48dc287b4ee55c9f0ef869307677a689cbfe1d31c9f1ba3a6e8b57cac9f5742. Actual CNG inspection confirms CurrentUser, nonexportable and private-export denied; counter initialized. This is not yet production enrollment or admission. Preview-only branch flags enabled for exact Selftest project; production unchanged at this checkpoint.
