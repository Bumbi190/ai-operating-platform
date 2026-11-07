# Nova — mejl, kalender och content-delegering

Utvecklingsbranch: `feat/nova-communications-marketing-20261107`. Pilot för den stationära Windows-datorn. Ingen ny tjänst eller licens.

## Genomfört och verifierat

- Kommandona **öppna Gmail** och **öppna STRATO / STRATO webmail** öppnar rätt respektive inloggningssida i webbläsaren. STRATOs officiella adress är `https://webmail.strato.com/appsuite/signin`. Inga lösenord, tokens eller mejl sparas eller läses av Nova.
- **Öppna kalendern i Omnira** går till den faktiskt implementerade `/planning`-översikten. Den är idag en aggregerad planeringsvy, **inte** en skrivbar händelsekalender.
- **Öppna marknadsplanering / sociala medier** leder till befintlig `/atlas/marketing`. Innehållsöversikten finns på `/atlas/content`.
- **Planera content till Familje-Stunden** känns igen på svenska med valfri kalendermånad, men leder bara till en skyddad gransknings-/beställningssida, utan automatisk agentkörning.
- Den nya `/nova-actions/marketing`-sidan använder befintligt autentiserat `POST /api/marketing/plans/generate` med `{target_month:"YYYY-MM"}`. Inloggning och projektbehörighet krävs; bara Familje-Stunden är stödd i första versionen. Den nya sidan har tvåstegsgodkännande, begränsar månader till aktuell + 12 månader och kontrollerar om en plan redan finns innan den beställer en ny körning.
- Vid lyckat svar krävs HTTP 202 + ett faktiskt körnings-ID och `status=pending`. Nova påstår **inte** att innehåll producerats eller publicerats. En körning kan ha ekonomisk AI-kostnad; ingen körning beställs bara genom att öppna sidan.
- En fristående `campaign-preview-origin.txt` kan peka mot en verifierad SSO-skyddad Vercel-preview, oberoende av Novas befintliga Atlas-brygga. Om ingen godkänd preview finns öppnar Nova den gamla marknadsgranskningen utan att skapa något.

## Kvar för riktigt kalenderstöd

Den granskade Omnira-koden har ingen produktionsverifierad skrivbar händelsekalender. `/planning` läser befintliga `manager_tasks`, `workflows` och `workflow_instances` men kan inte skapa tidsblock/händelser.

**Bygg inte en andra frikopplad kalender.** Välj och verifiera först en kanonisk källa (exempelvis integrerad Google Calendar, STRATO CalDAV eller Omniras egna privata kalenderhändelser), och definiera därefter:
1. användarskopad behörighet och sekretess; personliga händelser ska inte automatiskt synas för projektagenter;
2. konfliktkontroll, tidszon `Europe/Stockholm`, återkommande tider, idempotens och redigeringsflöde;
3. Nova föreslår händelse → du granskar datum/tid/deltagare → explicit godkännande → verifierat kalender-ID → visning i Omnira;
4. uppdatering/avbokning ska vara separat godkända handlingar; ingen tyst synkning.

Inga kalenderhändelser har skapats i denna branch.

## Kvar för mejl och social autopublicering

- **Mejl:** Att öppna Gmail/STRATO är inte samma sak som att ha läs-/skrivbehörighet. Gmail behöver kontrollerad OAuth-åtkomst i Omnira. STRATO behöver ett säkert IMAP-/SMTP-upplägg eller godkänd leverantörsintegration, med behörigheter/secrets på servern och samtycke. Nova får då läsa/sammanfatta/drafta; **skicka kräver uttryckligt godkännande**.
- **Content:** Familje-Stunden har befintliga `Campaign Planner`, `Channel Drafter`, `Brand Guard` och `marketing/approvals` API:er. Använd dem, skapa inte dubbletter. Kanaler/andra projekt behöver separata projekt- och destinationskontroller.
- **Social autopublicering:** Den granskade `marketing/approvals`-endpointen säger uttryckligen att godkännande *inte* schemalägger eller publicerar. Nästa steg är att verifiera den riktiga publiceringsmotorn, kanalkopplingarna och cron/status, och skapa flödet:
  plan → utkast → brandkontroll → ditt godkännande/regelstyrt mandat → schemalagd tid → idempotent publiceringsjobb → verkligt inläggs-ID eller felrapport.
  Inga skriv-/publiceringsrättigheter har lagts till här.

## Regression och begränsningar

```powershell
cd apps/nova-desktop
python -m unittest discover -s tests -p 'test_*.py' -q
python tests/smoke_mail_campaign_ui.py
node tests/marketing-qa/check_server_contract.cjs
node tests/marketing-qa/test_campaign_launch.cjs
```

- 85 Python-funktionstester godkända; isolerad GUI-rökprovning och Chromium-test för explicit godkännande och dubbelplanskontroll godkända.
- Browser- och GUI-tester använder simulerade API-svar och öppnar inga riktiga Gmail-/STRATO-konton eller sociala kanaler.
- GET-kontrollen av redan existerande plan är en *bästa-ansträngning-kontroll*, inte en transaktionell spärr mot samtidiga beställningar från flera flikar. En server-/databaserad idempotensnyckel behövs innan bred autonom användning.
- Produktions-Omnira, databas, schemaläggning, faktisk AI-kostnad och social publicering är orörda tills planerat godkännande.
