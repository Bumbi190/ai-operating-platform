# Atlas – levande körunderlag och lokal stoppgrind

Datum: 2026-10-19. Godkänd plan: `docs/superpowers/plans/2026-10-19-live-execution-lease.md`, André 12:53:52 Europe/Stockholm.
Kodintervall: `2dd4ec081054626b3388242af3c1f677e2718e8e..07e6aef4158b4b0a02331147c286da06a31adc07`.
Gren: `codex/atlas-code-worker-design-20261018`.

## Resultat och gräns

En ny serverkontroll bekräftar den aktuella claimen, brokern, behörigheten och WorkPackage inom samma låsta databastransaktion. Svaret innehåller enbart det fastställda körunderlagets bindning, mandatpinnar, tillstånd och giltighetstider. Den nya API-gränsen är avstängd som standard och kräver exakt `ATLAS_CODE_WORK_EXECUTION_LEASE_ENABLED=true`.

En separat signerad klient begränsar hela förfrågan till tre sekunder, inklusive signering och strömmande svar. Den avvisar felaktiga/duplicerade fält, fel UTF-8, för stora eller för djupa svar, främmande claim och svar som kommer för sent. Ingen automatisk omsändning eller credential recovery finns.

Den lokala stoppgrinden accepterar bara matchande uppdrag och mandat. Den delar en pågående kontroll mellan samtidiga anrop och använder räknare från en gemensam extern ägare. Efter ett avbrott kan sena svar aldrig återställa liveness. Ett normalt lokalt giltighetsfönster är högst nio sekunder efter säkerhetsmarginal; kontroll sker efter fem sekunder. Monoton tid avgör giltigheten, och upptäckta klockhopp/suspension stoppar konservativt.

Detta är en verifierad grund för körkontroll. Det finns ännu ingen operativ konsument av klienten/stoppgrinden. Den kan inte ensam avbryta dagens nativehjälpare, starta modelljobb, skriva projektkod eller publicera resultat. Serverns högst 90 sekunders claimförnyelse är inte ett tillstånd att fortsätta lokalt i 90 sekunder.

## Verifiering

| Kontroll | Resultat |
| --- | --- |
| Baslinje, nio befintliga filer | 150/150 |
| Del 1: projektion, HTTP och faktisk SQL | 52/52, webbens typkontroll 0 |
| Del 2: klient och kontrollkanal | 78/78, brokerns typkontroll 0 |
| Del 3: stoppgrind och klient | 66/66, brokerns typkontroll 0 |
| Full kontroll före del 4-commit | 301/301 i exakt 15 filer |
| Full kontroll efter del 4-commit | 301/301 i exakt 15 filer |
| Slutlig kontroll efter rättningscommit | 304/304 i exakt 15 filer |
| Överhoppade/todo/tomma testfiler | 0/0/0 |
| Båda typkontrollerna och git diff --check | exit 0 |

Nya kontrakt/tester observerades först röda utan implementation. SQL-funktionen anropades före migrationen och saknades som väntat. En separat regression visade att NaN som HTTP-status kunde accepteras som live; testet observerades rött och blev grönt när status krävdes vara ett säkert heltal. Första utökade SQL-körningen var 26/30: fyra tester hade ogiltig testdata som bröt befintliga CHECK-villkor. Testdatan rättades utan att något CHECK-villkor försvagades. Expiry för token och claim är identiska enligt schemat och testas därför tillsammans. Efter granskningens rättningar passerar faktisk SQL-kontroll 31/31. Den första uppsättningen av expiry-regressionerna nådde fixture-triggern i stället för beteendet; detta räknas inte som materiell RED. Efter rättad syntetisk seed visade separata tester både för sen leasegiltighet och live efter faktisk broker-expiry. Ett riktat låstest körde ett enda fall och uteslöt avsiktligt 30 andra; slutliga fulla kontrollen har inga uteslutna fall.

Gate använder de sex nya execution-lease-filerna samt sdf1a-code-work-contracts, sdf1b-code-work-control-plane, sdf1c-broker-identity-id, sdf1c-trusted-broker, sdf1c2-broker-control-channel, sdf-review-storage-service, sdf-review-storage-boundary, sdf-windows-source-boundary och sdf-windows-workspace-boundary. De exakta kommandona finns i den godkända planen och maskinunderlaget.

Detta är den namngivna kontrollen för ändringen. Hela produktens testsvit har inte körts. Föregående inkrements 355/355 och faktiska nativeprov 42/42 är historiska resultat och räknas inte som nya körningar här. Vites befintliga CJS-varning och SQL:s väntade nekanden/NOTICE-utskrifter i negativa tester finns kvar.

## Faktisk PostgreSQL och samtidighet

Alla testfall kördes i egna identifierade, tillfälliga PostgreSQL-containrar från redan cachad bild:
`sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d`.
Bildens konfigurerade version är PostgreSQL 16, `16.15-1.pgdg13+2`. Ingen bild hämtades eller byggdes. Faktiskt select version() från de slutliga databaskörningarna: PostgreSQL 16.15 (Debian 16.15-1.pgdg13+2) on x86_64-pc-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit.

Fast verifierad Docker-binär och ursprunglig backend/daemon användes. Containrarna hade nätverk none, inga portar eller bind mounts, read-only root, tmpfs PGDATA, 512 MiB och en CPU. Detta är en testdatabas och är inte ett nytt bevis för nativekodens isolering. Roller och syntetiska projekt/mandat skapades lokalt; riktig derive/propose/authorize/claim och nya SQL-funktionen användes. Ingen verklig enhetsregistrering, kunddata eller produktionsdatabas användes. HTTP-signering verifierades separat med verklig P-256-kryptografi; hela flödet är inte en liveinloggning/enrollment.

Testerna provar service-role-only RPC, RLS/grants och nekad direkt tabellskrivning, fel claimtuple/tokenhash, cancel/terminal/expiry, återkallad broker och Authorization, ändrade mandatpinnar och begränsade/nekade resurser. Tävlande revoke/cancel/scope/broker kan vinna före eller efter en leaseobservation; efter committad ändring måste nästa begäran nekas. Båda tillåtna ordningarna observerades. Ingen omedelbar distribuerad avbrytning hävdas. Ett nytt explicit WorkPackage-lås bekräftar att brokern fortfarande är giltig när RPC:n blockeras, släpper först efter expiry inom tidsgränsen och verifierar not_live samt noll förnyelsekvitton. Utgående giltighet begränsas också till en känd broker-expiry.

Hållen Authorization-låsning avslutade leasekontrollen utan förnyelse efter cirka 3155–3159 ms inklusive processoverhead. Ingen transaktionsretry användes. Alla 12 ägda testcontainrar är borttagna med exakt ID/etikett/bild-kontroll och bekräftad frånvaro på ursprunglig Docker-peer. Maskinunderlaget behåller samtliga ID:n, resurssnapshots och observerade raceutfall.

## Bevarat tillstånd

Arbetskopian behålls på `C:/Users/Andre/Projects/Omnira/.worktrees/atlas-voice-recovery-20261016`.
Huvudarbetskopians andra pågående arbete observerades på `29c88f0d1448a3be17a26ebd1179781e664bcff0` och lämnades orört. Den sparade verkliga proof-arbetskopian `c435e423-d964-428b-b5c0-4060d89ce3c6` var ren på `d3f9fcc1045026042f6bb9c0cd302ed0b7283127` och bevaras, liksom native attempt-tombstones. CLI, nativekällor, frozen runner/image/profile, command registry och sparat source-proof är oförändrade mot inkrementets BASE. Gemensam git-konfigurationshash och arbetskopior finns i maskinunderlaget.

Ingen push, merge, PR, deploy, produktionsmigration/flagga, ny faktisk source-jobbkörning, modellkostnad, paketinstallation eller abonnemangsändring har gjorts.

## Oberoende granskning

En färsk gpt-6-astra/high-granskare läste samtliga 20 ändrade filer i intervallet 2dd4ec0..2ca8e10, båda godkända specifikationerna, hela planen, de sju dåvarande rulings och alla fem Review Focus-fallen. Granskningen var read-only; granskaren körde inga tester. Utlåtande: With fixes, noll Critical, två Important och två Minor.

Båda Important rättades i EN TDD-omgång: exakt signerad kropp bevaras med ignoreBOM:true (RED200mot401→GREEN15/15), och broker-expiry kontrolleras igen vid utfärdandet (deterministisk SQL-låsning REDlive→GREENnot_live/noll förnyelser). Den kända broker-expiryn begränsar dessutom det utgående fönstret (egen faktisk SQL RED→GREEN). SQL31/31 passerar, följt av full kontroll på rättningscommit:304/304 och båda typkontrollerna0. Två Minor skjuts upp; ingen andra granskning gjordes.

## Återstående steg

Nästa inkrement behöver en samverkande nativebrygga som förbrukar stoppgrindens signal och ändå gör identitetskontrollerad cleanup. Därefter behöver den avgränsade worker/reviewer-körslingan, modellåtkomst/budget och evidens/publiceringsgrind kopplas ihop och bevisas innan något kan införas i ordinarie projektkod. De tidigare godkända gränserna och mänsklig granskning kvarstår.

## Beslut och uppskjutna mindre fynd

Följande är samtliga18Rulings i beslutsordning, inklusive ett beslut för vart och ett av granskarens tio Declined to judge-områden. Varje rad bevarar kostnaden om beslutet är fel.

1. Reuse the verified existing linked worktree/dependencies and approved bounded fifteen-file gate; no npm install or whole-repository suite — explicit approved plan forbids install and names proportional verification, while predecessor355/355 remains historical — cost if wrong: unrelated broad failures remain outside this increment; never claim all-product green.

2. Bring the real SQL missing-function RED fixture forward from Task4 before writing the new migration — service doubles alone cannot prove the SQL birth boundary — cost if wrong: an earlier owned PostgreSQL fixture can block Task1; no runtime source job or production DB is touched.

3. Preserve service-role-only broker RPC with token-hash/claim/project checks rather than auth.uid user-session checks; local SQL catalog/grant tests replace hosted advisors — approved signed broker design is not a user JWT endpoint and hosted database access is forbidden — cost if wrong: deficient broker proof checks could expose a foreign lease; no generic/public grants allowed.

4. Author the plan's exact migration file without installing Supabase CLI — no installed CLI was found in PATH/node_modules/Programs, and approved plan forbids dependency installation and hosted schema operations — cost if wrong: migration naming/history needs manual local review; canonical history is not changed or applied in production.

5. SQL uses a3second elapsed deadline with remaining lock budgets before each lock and a final pre-publication check — a function-local statement_timeout alone is not sufficient to bound the already running direct SQL statement — cost if wrong: a slow SQL request can hold locks longer; the client still receives no authority after its own3second deadline. Real lock/contention cases belong to Task4.

6. Extend the existing exact route inventory from six to seven for execution-lease only, keeping all generic/execute/context/patch/action route denials and old operation behavior — the approved plan adds this purpose-specific route but omitted the predecessor inventory assertion from its file map — cost if wrong: an unintended endpoint could be accepted by the test; new AST/no-consumer/disabled-route tests must remain independent.

7. The real schema requires token expiry to equal the claim lease and terminal state to carry terminal_at. Keep all CHECK constraints; test joint lease/token expiry as one case, set terminal_at, and corrupt pinned admission plus its flattened projection consistently while leaving the canonical hash stale. Cost: independent lease/token expiry cannot be manufactured under this schema; the first SQL expansion was 26/30 because four fixtures violated these constraints, not because the lease RPC passed invalid authority. Preserve task4-sql-initial-failure.json and replace the redundant pair with one valid coupled-expiry case.

8. Native process termination/cooperative cleanup remains unproven — no bridge/operational consumer exists and AbortSignal alone is not native termination — cost if wrong: a future caller could leave native work running; activation requires the separate cooperative bridge proof.

9. Worker/model execution, patch application, reviewer dispatch and publication remain later increments — absent from this change, no code-writing authority is activated — cost if wrong: Atlas still cannot complete an autonomous code job from this foundation alone.

10. Live HEAD/target-ref freshness, filesystem containment and model-spend authority require separate future checks — metadata cannot substitute for those proofs — cost if wrong: an eventual consumer could accept stale/out-of-scope or unbudgeted work; do not connect one without those gates.

11. Distributed cancellation after an observation wins remains bounded, not instantaneous — approved conservative local window remains and already-expired issuance IS fixed — cost if wrong: work may progress during the remaining maximum9second local window after a concurrent revoke.

12. Legacy npm registry and frozen runner/profile stay unchanged and unequal — this increment neither dispatches nor selects commands — cost if wrong: later command integration must resolve the mismatch before execution.

13. Broker-wide sequencing across future operational callers is not proven — new guard correctly accepts one externally owned ordered counter source — cost if wrong: parallel future consumers could collide and stop; integration must supply one owner.

14. Hosted migration/advisors and live enablement are not performed — approved plan authorizes only local owned SQL — cost if wrong: local evidence does not prove production migration or configuration readiness.

15. No universal hard3second PostgreSQL statement interruption is claimed — elapsed publication checks and lock budgets differ from an interrupt for arbitrary CPU work; client deadline remains independent — cost if wrong: server locks/resources may remain occupied after the client refuses, without granting late authority.

16. Whole-product regressions and predecessor native/source reruns remain outside current evidence — approved named15gate only, old355/355 and42/42 are historical — cost if wrong: unrelated repository or native regressions may remain undetected by this increment.

17. Durable report/Notion reread/scratch cleanup were post-review and are now root handoff duties — preserve their evidence and verify them directly, do not dispatch another reviewer — cost if wrong: handoff or cleanup could be incomplete despite reviewed code.

18. Also cap projected leaseUntilMs by a known broker expires_at while fixing issuance-time expiry — the closed DTO needs no extra field and future local liveness must not exceed a known eligibility deadline — cost if wrong: metadata may force earlier refresh/stop than the underlying claim lease; this only attenuates authority. Cover with a separate real-SQL RED→GREEN case in the same fix pass.

Uppskjutna mindre fynd:

- SQL Promise.allSettled races do not force each competing lock interleaving; later harden broker/WorkPackage race barriers. New expiry regression WILL use an explicit held WorkPackage lock.
- Dense guard/handler formatting makes audit harder; later formatting-only cleanup.

Maskinunderlag: `2026-10-19-live-execution-lease-evidence.json`. Notion uppdaterades och återlästes efter lyckad asynkron skrivning. Endast denna plans identitetskontrollerade scratch togs bort efter beständig överlämning. Arbetsgren, övriga arbetskopior, verkligt source-proof och native-tombstones bevaras. Ursprunglig Docker-peer bekräftades och inga planmärkta testcontainrar återstod. Utfallet finns i 2026-10-19-live-execution-lease-cleanup.json.
