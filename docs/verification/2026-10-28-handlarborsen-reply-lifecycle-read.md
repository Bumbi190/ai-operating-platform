# Handlarbörsen – ägargrindad status för mejlsvar, godkännande och sändning

**Datum:** 2026-10-28  
**Arbets-ID:** HB-REPLY-STATUS-20261028  
**Typ:** Ny, begränsad och enbart läsande Atlas-läsning. Ingen aktivering.

## Varför
Tidigare svar sammanfattade `sales_reply_jobs.status='awaiting_review'` som att svaret saknade godkännande. En källavstämd, projektlåst och enbart läsande SQL-kontroll visade däremot för **samma aktuella utkast**:
- reply-jobb: `awaiting_review`,
- aktuell utkastrevision: approval `approved`,
- kopplat skickajobb: `smtp_accepted`,
- aktuell sändpolicy: 1 registrerad och `enabled=true`, men **utgången** (0 aktiva och ej utgångna),
- registrerad timingregel: 14 dagars minsta väntan och högst 1 påminnelse.

Detta är separata nivåer: jobbstatus, redaktionellt godkännande, SMTP-kvitto, mottagarleverans och framtida sändbehörighet. `smtp_accepted` är aldrig bevis på leverans, och ett historiskt godkännande eller en policy som tidigare var giltig är inte ett nytt utskickstillstånd.

## Återanvända databastabeller
`sales_reply_jobs`, `sales_reply_draft_revisions`, `approvals`, `sales_send_jobs`, `sales_send_policies` och `sales_contact_timing_rules`. Ingen tabell skapas eller migreras.

### Nytt verktyg
`handlarborsen_reply_lifecycle` (tomt `input_schema`) i samma `HANDLARBORSEN_READ_TOOLS`-uppsättning som befintliga ägargrindade läsverktyg.

Verktyget använder strikt, fast Handlarbörsen-projekt-ID och redan befintlig owner-allowlist plus oberoende verifiering av `projects.owner_id` och `atlas_mode`. Anropet tar inte projekt, jobb-ID, kontakt, tabell eller mottagare från modellen.

Läsningen använder högst 200 objekt per källtabell och gör endast whitelistan av tekniska kolumner. I serverminnet kopplas interna tekniska ID:n ihop för att ge grupperade kombinationer av:
- reply-jobbets processstatus,
- aktuell utkastrevision och godkännandestatus,
- nuvarande utkasts kopplade skickstatus.

**Ingen** kontaktidentitet, e-postadress, mejltext, ämnesrad, källa med sekretessvärden, approval-innehåll, råa tekniska ID:n eller obearbetad DB-rad returneras till Atlas. Allt fallerar stängt vid källfel, saknade kopplingar, oanvändbara statusvärden och för stora datamängder. Inga delvis rätta resultat eller påhittade nollor.

Även sändpolicyns utgången/aktiverad-status och senaste registrerade timingregel sammanfattas utan att aktivera en sändning. Svaret har observerad tid och `non_atomic_multi_table_observation`: flera separat lästa tabeller är inte ett transaktionskonsistent ögonblicksfoto.

### Routing
En uttrycklig begäran som `Visa Handlarbörsens svarsgodkännande och skickstatus` öppnar full verktygsväg även från `mode=content`. Atlas får **endast** det namngivna statusverktyget för den turen. Vanliga CRM-antal, Stratos senaste mejl, externa workflowjämförelser, Notion och skriv-/sändkommandon går fortfarande sina egna vägar.

### Kvalitet och skydd
- Positiva och negativa intent-fall samt ägarkontroll, projektisolering, begränsad läsning, `approved` utan påstådd leverans, policyutgång, bruten koppling, tomt mot otillgängligt, datagräns och inga PII eller externa effekter testas i `handlarborsen-reply-lifecycle.test.ts`.
- Testfilen körs i befintliga **Atlas Project Isolation**-CI med anti-skip-krav på minst 25 testfall.
- Test och Vercel-build på **exakt PR-HEAD** måste vara gröna innan någon merge eller produktionsrelease.
- Inga ändringar i CRM-kontakter, suppression, SCB-kandidater, RLS, SQL-funktioner, sändpolicyer, smtp/Resend, schemaläggare, brev, n8n-exekvering eller godkännanden.

## Preflight och parallell utveckling
Enligt `AGENTS.md` kördes repo-preflight två gånger. Den första flaggade 7 orelaterade PR:er med generiska ord som `read-only` och `review`. Deras faktiska filer granskades: SCB Lead Finder och kreativa arbetare, inte statuskorrelationen. Den andra, exakt avgränsade preflighten mot `main=85d78f2397cd1aa0ab30b91cf83878ae23a362a4` gav **new_branch_approved** för `HB-REPLY-STATUS-20261028`. Kvitto:
`C:\Users\Andre\Projects\Omnira\Temp\hb-reply-status-preflight-specific-20261028.json`

Egen branch: `feat/atlas-hb-reply-lifecycle-read-20261028`. Ordinarie smutsig main-worktree och Handlarbörsens parallella SCB-arbetskopior har inte ändrats.

## Efter eventuell godkänd merge
Inloggad Atlas-operatör frågar:
`Visa Handlarbörsens svarsgodkännande, svarsutkast, kopplade SMTP-jobb och sändpolicyns giltighet. Ändra eller skicka ingenting.`

Verifiera verkligt tool-kvitto `handlarborsen_reply_lifecycle` i samtalsloggen, sammanhållen men separat svarsklassificering och inga affärsdataskrivningar. Befintlig chatts sparande av konversations- och verktygskvitton fortsätter som tidigare.
