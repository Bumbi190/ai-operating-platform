# PR-underlag: Atlas kodarbete på Windows (`codex/atlas-code-worker-design-20261018` → `main`)

Status: förberett lokalt. Ingen push och ingen PR innan André godkänt.

## Läge

- Grenen ligger 72 commits före och 5 commits efter `origin/main` (`d3f9fcc`, enligt senaste lokala fetch). `git merge-tree` ger en ren sammanslagning utan konflikter.
- Omfattning: 191 filer, cirka 26 600 tillagda rader. Ändringarna ligger i `apps/code-broker` (90 filer), `apps/web` (69), `docs/verification` (16) och `docs/superpowers` (16).
- Nya migrationer:
  - `20261018185809_atlas_code_review_storage.sql`
  - `20261019110000_atlas_code_work_execution_lease.sql`
- Ny route: `POST /api/atlas/code-work/broker/execution-lease`. Den är avstängd som standard och kräver exakt `ATLAS_CODE_WORK_EXECUTION_LEASE_ENABLED=true`.
- Inga ändringar i `vercel.json`, cron eller befintliga flaggor.

## Föreslagen PR-text

**Titel:** Atlas: isolerat kodarbete på Windows med körunderlag, kooperativt stopp och engångsguard (avstängt)

**Beskrivning:**

Den här PR:en lägger grunden för att Atlas ska kunna driva kodagenter i en isolerad arbetskopia på den stationära Windowsdatorn. Ingen operativ förmåga aktiveras.

Innehåll:
- Windows-brokerns identitet i CNG, värdkvalificering, skyddade worktrees, sandboxprov och pinnad källmaterialisering.
- Oberoende granskningskontrakt och beständig, rollbunden granskningslagring.
- Levande körunderlag (execution lease) med irreversibel stoppgrind. API:t är avstängt som standard.
- Kooperativt nativestopp via kontrollkanal: grace-kill vid varje stopp, hård gräns och identitetskontrollerad städning.
- Engångsguard: ett körunderlag godkänner exakt ett försök.

Verifiering:
- Slutkontroll 386/386 tester i 19 filer, typkontroll och `git diff --check`.
- Riktiga försök A–D på Windows.
- Reproducerbara nativebinärer bundna till bevisen.
- Tre oberoende granskningar och en fjärde efter guard-rättningen, se `docs/verification/`.

Inte med:
- Modellanrop, kodagentslinga, AI-granskare som körs, samtalsingång, merge eller deploy.
- Inget sådant körs eller aktiveras av den här PR:en.

Före merge:
- [ ] André har granskat diff och verifieringsrapporter.
- [ ] Migrationerna appliceras endast efter separat godkännande, file-first, via ordinarie migrationsflöde och inte via MCP-DDL.
- [ ] `ATLAS_CODE_WORK_EXECUTION_LEASE_ENABLED` förblir osatt i alla miljöer.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01XXu1KhLbDro9cvUC53gB8v

## Kommandon (körs först efter godkännande)

```
git -C C:/Users/Andre/Projects/Omnira/.worktrees/atlas-voice-recovery-20261016 fetch origin
git -C C:/Users/Andre/Projects/Omnira/.worktrees/atlas-voice-recovery-20261016 merge-tree --write-tree --name-only origin/main HEAD
git -C C:/Users/Andre/Projects/Omnira/.worktrees/atlas-voice-recovery-20261016 push origin codex/atlas-code-worker-design-20261018
gh pr create --repo Bumbi190/ai-operating-platform --base main --head codex/atlas-code-worker-design-20261018 --title "Atlas: isolerat kodarbete på Windows med körunderlag, kooperativt stopp och engångsguard (avstängt)" --body-file docs/superpowers/plans/2026-10-20-pr-preparation.md
```

Huvudcheckoutens nio befintliga ändringar berörs inte. PR:en görs från worktreen.
