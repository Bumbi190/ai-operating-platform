# Nova Native Tasks — första kontrollerade arbetsmotorn

**Omfattning:** Lokal Windows-pilot, separat Git-branch `feat/nova-native-taskrunner-20261107`. Bygger på Nova Premium `5577b89`. Ingen ny AI, inga API-nycklar och inga nya abonnemang.

## Kommandon som fungerar i pilotkoden

| Röst-/textkommando | Verklig åtgärd | Godkännande |
|---|---|---|
| "Nova, kolla projektstatus på Omnira" | Läser aktuell Git-branch, commit och antal ändrade spårade filer i godkända Omnira-repot | Nej (skrivskyddat) |
| "Nova, visa status för Handlarbörsen" | Samma sak i godkända Handlarbörsen-repot | Nej (skrivskyddat) |
| "Nova, hur mycket ledigt diskutrymme har jag?" | Läser systemdiskens verkliga lediga/total kapacitet | Nej (skrivskyddat) |
| "Nova, öppna Handlarbörsen och Instagram" | Visar en plan på två namngivna godkända webbplatser och öppnar dem i tur och ordning | **Ja**, via `⋯ → Godkänn 2 öppningar` |
| "Nova, öppna VS Code och Omniras projektmapp" | Visar en plan: starta godkänd app och öppna en godkänd projektmapp | **Ja** |

De enskilda kommandona för öppna, scrolla, nästa flik, tillbaka och fokus från den befintliga Nova-versionen är fortfarande kvar.

Röst: `Ctrl + Alt + Space` begär Windows diktering. Efter cirka tre sekunders oförändrad transkription skickar Nova frågan automatiskt. Skrivskyddade uppdrag körs direkt; flerstegsplaner **skickas endast till godkännande**, inte till körning. Ingen mikrofon kan bekräfta att talet avslutats säkert med enbart denna teknik.

## Färdighetsgränser

- Endast exakta, namngivna URL-, app- och mappmål kan användas. En användarangiven godtycklig URL eller sökväg avvisas.
- Längst tre öppna-steg i en plan. Planen granskas via den befintliga dolda `⋯`-menyn innan något körs.
- `Stopp` avbryter steg som ännu inte har skickats till Windows. Redan öppnade fönster kan inte ångras.
- Projektstatusen är **lokal Git-status**. Den är inte Vercel-produktionsstatus, Supabase-data, CRM eller Atlas-minne och ska inte beskrivas som det.
- Windows accepterar en begäran att starta app/webbsida, men Nova kan inte ännu bekräfta att rätt webbsida laddats eller att en inloggning lyckats.
- Inga formulär, mejl, publiceringar, betalningar, Git commits, filändringar, terminalkommandon eller fria skärmklick körs här. De kräver en separat agentintegration och tydliga behörighetskontroller.
- Atlas v2 Preview är fortfarande en annan, SSO-skyddad integrationsgren. Den är inte automatiskt ihopkopplad med den här nativen.

## QA

Inga sidor öppnas på riktigt i UI-rökproven: Windows-stegen mockas.

```powershell
cd apps/nova-desktop
python -m unittest discover -s tests -p 'test_*.py' -q
python tests/smoke_native_task_ui.py
python tests/smoke_native_voice_ui.py
```

För extra skrivskyddad kontroll går det att anropa `parse_native_task` och `execute_native_step` direkt med en av de hårdkodade statusfrågorna. Det har verifierats mot de två lokala reporna och systemdiskens faktiska kapacitet.

## Säker integration

1. Behåll arbetet i egen worktree tills full regression och manuell QA är godkända.
2. Applicera bara native task-filerna på senaste Nova Premium-branch genom en kontrollerad merge/cherry-pick. Läs status och undvik att skriva över någon annans osparade filer.
3. Starta om Nova när det kan göras utan att förlora aktiv diktering. Behåll en backup av senaste fungerande commit och bekräfta `Ctrl+Alt+Space` efter omstart.
4. Mer avancerade webb- och datoruppgifter kräver en separat, användarstyrd operatör med per-steg-godkännande, revisionslogg, behörighetsisolering och stoppfunktion. Låt inte en fri LLM-text bli ett Windows-kommando.
