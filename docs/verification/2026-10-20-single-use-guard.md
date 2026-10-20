# Atlas – körunderlagets guard förbrukas exakt en gång

Datum: 2026-10-20. Godkänd plan: `docs/superpowers/plans/2026-10-20-guard-single-use.md` (André 07:32, inklusive granskningens fyra bryggfynd).
Testad källkod: `d2068b876b2285c5ee30916f460a74516ec2ca35`. Maskinunderlag: `docs/verification/2026-10-20-single-use-guard-evidence.json`.

## Resultat

- `ExecutionLeaseGuard.claimSingleUse('native_materialization')` returnerar `true` exakt en gång under guardens livstid. Därefter, och för en stoppad guard, blir svaret alltid `false`.
- Bryggan tar anspråket som första steg, före validering, läsning, reservation och launch. Varje senare eller samtidigt anrop, från vilken brygginstans som helst, får `not_started/guard_consumed` utan sidoeffekter.
- Varje utfall utom `observed` stoppar guarden. Det gäller även `not_started` efter anspråket och kastade fel.
- Granskningsfynd 1: efter beslutet armas ingen timer, inga `continue`-ramar skickas och stoppskälet ändras inte.
- Granskningsfynd 2: ett stopp som startaren skickat själv förblir `control_lost`.
- Granskningsfynd 8a: en tvångsavslutad hjälpare som inte stänger ger `stopped/unknown` efter 10 s, och ingen städning körs ovanpå den.
- Granskningsfynd 8b: `workspace-helper.ts` ingår i de riktiga försökens källbindningar.

## Verifiering

| Kontroll | Resultat |
| --- | --- |
| RED före implementation | 8/8 för guardförbrukning (i fem fall startade ett andra försök); 3/3 för bryggfynden; 1/1 för bindningar |
| Extra samtidighetstest: tio samtidiga anrop via tio brygginstanser | rött på koden före rättningen; grönt efter: exakt 1 reservation, 1 launch och 1 städning, 9 `guard_consumed` |
| GREEN, riktat | 98/98 (brygga, guardförbrukning, guard) |
| Ändrade äldre tester | fyra brotester återanvände en guard för flera anrop; de använder nu en ny guard per anrop, med oförändrade assertioner. Enda ändrade förväntan: en guard som stoppats före första användning ger `guard_consumed` i stället för `lease_not_live`, fortfarande utan läsning och reservation (planens kontraktspunkt 1) |
| Riktiga försök A–D på `d2068b8`, en gång vardera | gröna; alla resurser frånvarande (containrar 40/40, volymer 48/48); gravstenar 39 → 51 |
| Binärer | identiska byte vid `7c16110` och `d2068b8` (`b018302f…` / `f7031109…`) |
| Slutkontroll, 19 filer (ny fil enligt planens steg 4) | 386/386; 0 fel, 0 överhoppade, 0 todo; smoke 34/62/25/7/8; bygget 0 varningar; typkontroll och `git diff --check` utan fel |
| PostgreSQL (klass P) | `removed`, frånvaro bekräftad, 342 identitetskontroller, båda fönstren stängda |

Inga tester har uteslutits. Planens scratch togs bort efter förra omgången och återskapades med samma `plan-path`-identitet för den godkända omkörningen.

## Oberoende granskning

En ny, endast läsande granskare (utan tidigare kontext, fryst kopia, körde ingenting) granskade `48034ba..d2068b8`. Utfall: **APPROVE WITH MINORS**, inga materiella fynd.

Granskaren bekräftade följande:
- Anspråket är synkront och tas först.
- Varje väg nekar före sidoeffekter eller slutar med stoppad guard.
- Fynd 1, 2, 8a och 8b är implementerade enligt planen.
- De ändrade äldre testerna är likvärdiga eller strängare, och inga assertioner har försvagats.
- De nya testerna hade fallerat på koden före rättningen.
- Bevisen A–D stämmer med påståendena.

| # | Fynd | Risk | Rekommenderad åtgärd |
| --- | --- | --- | --- |
| 1 | Anspråket kan förfalskas av kod i samma process (`{...guard, claimSingleUse:()=>true}`). Det ligger utanför hotmodellen, som gäller anroparens misstag. | Låg | Privat `WeakSet` i guardmodulen och en exporterad `claimGuardUse(guard)` som nekar objekt som fabriken inte skapat |
| 2 | Guarden stoppas först när städningen är klar (upp till cirka 6 s i D). Ett andra försök är ändå omöjligt, men andra innehavare ser guarden som levande under städningen. | Låg | Stoppa guarden så fort ett icke-`observed`-utfall är bestämt |
| 3 | En injicerad `schedule` som kastar efter launch lämnar hjälparen utan stopp; dess egen deadline gäller. Produktion använder `setTimeout`. | Låg | Skydda uppsättningen efter launch med `own.stop()`/`own.kill()` vid fel |
| 4 | Testluckor: att kill-wait-timern avbryts, `claimSingleUse` med fel syfte vid första anropet, guard utan `claimSingleUse`, kastat fel, och att falsk `stop` anropar `stopped` synkront | Låg | Lägg till testerna |
| 5 | Planen säger att befintliga tester är oförändrade och att det finns 8 tester. I själva verket ändrades fyra tester likvärdigt, och filen har 9 tester. | Information | Rättat i planen |

Raden `no such object` i kontrollens logg är Dockers stderr från PG-fixturens frånvarokontroll efter borttagning. Den är väntad, och testet bekräftar den uttryckligen.

Fynd 1–4 rör samma två säkerhetsbundna filer. Att rätta dem gör A–D inaktuella, så de bör tas samlat i ett eget godkänt steg och inte smygas in.
