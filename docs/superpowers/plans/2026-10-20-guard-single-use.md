# Plan: körunderlagets guard förbrukas exakt en gång

Datum: 2026-10-20. Status: RED-tester skrivna; implementationen väntar på Andrés godkännande (säkerhetskritisk ändring).
Gren: `codex/atlas-code-worker-design-20261018`, bas `48034ba`. Worktree: `.worktrees/atlas-voice-recovery-20261016`.

## Problem (bekräftat med RED, inte bara teoretiskt)

`createNativeStopBridge` konsumerar aldrig den `ExecutionLeaseGuard` den får. Efter ett `stopped`-resultat där guarden fortfarande lever (t.ex. `control_lost` efter ett protokollbrott), efter ett `observed`-resultat, samtidigt medan ett försök pågår, eller via en annan bryggninstans, kan samma guard starta ett **andra** försök med ny reservation och ny nativeprocess. Testfilen `apps/web/lib/qa/sdf-native-stop-guard-consumption.test.ts` visar detta: 8/8 röda; i fem fall returnerar det andra anropet inget `not_started` utan startar ett andra försök (`still_running`, reservation och launch räknas upp).

Risk: medel–hög inför första operativa konsument (i dag ingen konsument). Ett mandat för ett försök kan bli flera, och samtidiga körningar mot samma claim blir möjliga.

## Kontrakt

1. `ExecutionLeaseGuard` får `claimSingleUse(purpose:'native_materialization'):boolean`. Första anropet under guardens livstid returnerar `true`; varje senare anrop, med samma eller annat syfte, returnerar `false`. En stoppad guard returnerar alltid `false`.
2. Bryggan anropar `claimSingleUse` som **första** steg, före indatavalidering, plattformskontroll, bindningskontroll, läsning, reservation och launch. `false` ger `{status:'not_started',reason:'guard_consumed'}` utan några sidoeffekter.
3. Varje resultat utom `observed` stoppar guarden (`guard.stop()`), även `not_started` efter att anspråket tagits (t.ex. `binding_mismatch`, `input_invalid`, `helper_unavailable`). Fail-closed: ett felaktigt anrop förbrukar mandatet, och anroparen måste skaffa en ny guard för ett nytt försök.
4. Efter `observed` lever guarden kvar för jobbets fortsatta steg (samma claim/lease), men kan aldrig starta en ny materialisering.
5. `GuardedMaterialization['not_started']['reason']` utökas med `'guard_consumed'`. Inga andra fält eller behörigheter ändras.

Avvägning: att förbruka redan vid första anropet kostar ett nytt körunderlag om anroparen gör fel, men stänger alla vägar till återanvändning utan att bryggan behöver tillstånd utanför guarden. Alternativet (en WeakSet i bryggmodulen) skyddar inte mot en annan modulinstans och väljs inte.

## Steg

1. Klart: RED-testerna (8 st) i `sdf-native-stop-guard-consumption.test.ts`, observerade röda av rätt skäl.
2. Efter godkännande: implementera punkt 1 i `apps/code-broker/src/runtime/execution-lease-guard.ts` och 2–5 i `apps/code-broker/src/runtime/native-stop-bridge.ts`. Inga nativeändringar.
3. GREEN: den nya filen 8/8; befintliga `sdf-execution-lease-guard.test.ts` och `sdf-native-stop-bridge.test.ts` oförändrade gröna; brokerns typkontroll.
4. Lägg den nya filen till slutkontrollen (19 filer). Uppdatera boundary-testernas kommentarer, inte deras allow-list.
5. Konsekvens för riktiga bevis: båda filerna ingår i A–D:s källbindningar. A–D blir därför inaktuella och kräver ett nytt godkännande för en körning vardera (cirka 3 minuter, klass N). Ingen automatisk omkörning.
6. Full slutkontroll, kort verifieringsnotis, oberoende granskning av ändringen.

## Tillägg från granskningen 2026-10-20 (samma filer, samma godkännande)

Granskningen av `b3b86f2..7c16110` (`docs/verification/2026-10-20-fix-pass-review.md`) gav fyra mindre fynd i bryggan. De tas med här eftersom de rör samma två filer, och en separat ändring skulle göra A–D inaktuella en gång till. Varje punkt får ett RED-test före implementationen:

- **Fynd 1.** En `finished`-flagga sätts när `done` har lösts eller kastat. Efter det är `sendStop`, `armGrace` och checkpoint-svar no-ops, så inga timers kan armas och inget stoppskäl ändras efter beslutet. Timers avbryts i `finally`.
- **Fynd 2.** `stopped` från startaren sätter `stopReason ??= 'control_lost'` innan grace-perioden armas.
- **Fynd 8a.** Väntan på `done` efter kill begränsas, till exempel till 10 s. Kommer ingen `close` blir utfallet `stopped/unknown`, och någon städning som kan överlappa en levande process görs inte.
- **Fynd 8b.** `workspace-helper.ts` läggs till i A–D:s källbindningar. Det sker i bevisharnessen, så det kräver ingen ändring av produktkoden.

Fynd 3, 6 och 7 gäller bevisharness, bygginställningar och boundary-test. De planeras separat och påverkar inte A–D.

## Utanför scope

Ingen ändring av servern, leasegränsen, nativehjälparen, Docker eller produktionsflaggor.
