# The Prompt – daglig nyhetsredaktion med Amazon Bedrock (2026-11-17)

## Beslut och verklig status
- Mål: theprompt.nu får **dagligen** en fördjupning av en redan verifierat socialt publicerad AI-nyhet och en ny relevant, fristående AI-artikel (2 artiklar/dag är ett mål, inte ett krav att publicera när kvalitet saknas).
- Nuvarande implementerad etapp: en **skrivskyddad** daglig kandidaturvalare + agentrollsplan. Inga AI-modellanrop eller publika artiklar skapas av den nya etappen. Den är avstängd som standard.
- theprompt.nu ligger i befintligt Vercel-projekt the-prompt-web och läser artiklar dynamiskt från sin egen Supabase. Ingen daglig ombyggnation av hemsidan ska krävas.
- Omnira har redan artikelsystemet lib/article med källhämtning (Hermes), Writer (nu Anthropic), QA, website_content, godkännanden och publish_article-RPC mot The Prompt. **Återanvänd** detta. Bygg ingen extra publiceringsmotor.
- Inventering 17 nov: den centrala Omnira-tabellen website_content hade 0 rader, The Prompt har 372 manus och över 500 news-items. 332 manus har status published med sociala publicerings-ID:n. Nyaste 9 manus låg pending_review utan kvitton. Artiklarna på mottagarens separata Supabase har inte inventerats här.
- The Prompts projektbudget: 700 SEK/månad, 400 SEK/vecka, 100 SEK/dag (befintliga inställningar). Den hårda körspärren H1_SPEND_GATE är **inte** satt i Vercel; projektbudget är inte samma sak som hårt stopp.

## Det som är implementerat i AWS-testgrenen
- lib/article/daily/editorial-plan.ts: deterministiskt val, max 1 nyhet med socialt publiceringskvitto + 1 fristående oanvänd news-item, avgränsade tidsfönster, project_id, giltiga HTTPS-källor och duplicate/external_id-spärr.
- Riskfyllda rubriker som påståenden om personers brott, självskada, dödsfall, chefsavgångar och rykten utesluts från obevakad daglig planering och kräver separat manuell granskningskö.
- lib/article/daily/inventory.ts: läser befintliga tabeller *endast för The Prompts projekt-id*. Inga DB-skrivningar, ingen webb-hämtning, ingen AI-kostnad.
- lib/article/daily/agent-blueprint.ts: fem framtida roller, alla kanInvokeModel=false och canPublish=false i pilot. Roller: News Scout, Corroboration Researcher, Longform Writer, Independent Fact Checker, Publication Controller.
- GET /api/article/cron/daily: kräver CRON_SECRET. Flaggan DAILY_ARTICLE_PLANNER_ENABLED måste vara true för ens en skrivskyddad plan. Saknad flagga = disabled. Varken denna flagga eller ARTICLE_AUTOPUBLISH ger modell-/publiceringsrätt.
- apps/web/vercel.json: 07:55 UTC daglig cron (08:55 CET vinter, 09:55 CEST sommar). Scheduler påverkar först Production om/efter en senare merge av just denna konfiguration. I denna testgren är produktionsschemat orört.

## Arkitektur för riktig daglig produktion (inte aktiverad)
1. NEWS SCOUT: efter befintlig The Prompt-källa söker deterministiskt efter 1 social-kvitto + 1 oberoende nyhet. Annan rubrik eller falsk publikationsstatus får inte räcka.
2. CORROBORATION RESEARCHER: läser ursprungskällan med verifierad hämtning och söker minst en *oberoende källa*. AI får ingen egen webbaccess bara för att den kan skriva en länk. Fakta, citat, tidpunkter och provenance måste knytas till källor.
3. LONGFORM WRITER: gör originaltext på 450–750 ord (standard) eller 900–1300 (fördjupning) i befintlig The Prompt-redaktionell stil, från verifierat innehåll; socialmanuset är ämnesingång, inte enda källan. **Skrivmodellen är ännu inte vald/bedömd.**
4. FACT CHECKER: separat kontroll av varje väsentlig faktauppgift, originalitet, överlapp med källor, datum, risk och publiceringsrättigheter. Felaktig eller tunn källgrund = pending_review, aldrig automatisk live.
5. PUBLICATION CONTROLLER: upsert i Omniras website_content/approvals och vidare till befintlig destination 'the-prompt' via publish_article (external_id är idempotent), enbart efter giltig signerad projekt- och kanalbegränsad autonomilicens ELLER explicit redaktionellt godkännande. Avbrott/STOP och budget kontrolleras precis före extern dispatch.

## AWS-modeller och åtkomst
- En Nova Micro-anropstext är verifierad via Vercel OIDC → IAM Preview-roll → Bedrock. Ingen statisk API-nyckel behövs.
- AWS Bedrock Agents Classic accepterar inte nya kunder. Rekommenderat: bygg projektspecifika agentroller i Omnira som använder Bedrock Converse (och utvärdera Amazon Bedrock AgentCore senare). AgentCore har separata förbrukningsbaserade priser; gratis webbsökning (5 000 frågor/månad enligt AWS november 2026 release notes) ska inte förväxlas med gratis modeller.
- Nova Micro är lämplig kandidat för triage och klassificering men har ännu inte godkänts för att producera långa, faktakritiska artiklar. Utvärdera Nova Lite/Pro eller annan stark modell i en separat kvalitetspilot och begränsa IAM till exakt godkända modellresurser.
- För Production ska **en NY, separat** IAM-roll med OIDC trust för environment:production granskas. Återanvänd eller bredda aldrig Preview-rollen av bekvämlighet.
- Den nya rollen får inte tilldelas rättigheter till Supabase/publicering. AWS-rollen ska bara få anropa en godkänd Bedrock-modell; publiceringsrätt ska styras av Omniras server/granskningspolicy.
- AWS Activate-krediter: deras faktiska tillämpning måste bekräftas i AWS Billing före volymökning. AWS Budget 10 USD/månad är bara en varning.
- Ge inte generella nattliga återförsök av tvetydiga modell-/publiceringsfel. Använd Omniras kanoniska withGovernedSpend, fysisk STOP, engångsanrop och cost_events.

## Produktions-GO/NO-GO
NO-GO tills alla dessa är bekräftade:
- Riktig IAM-produktionsroll och OIDC trust; inga permanenta nycklar
- Hård budget/STOP (med begränsning till The Prompt så andra Omnira-projekt inte påverkas)
- Källbevis och rättigheter för minst två oberoende referenser per artikel, utan fabricerade citat
- Försök i testmiljö med faktisk DB-reservation/settlement och korrekt hantering av avbrutna körningar
- Redaktionsagent, skribent och separat QA granskade på riktiga, ofarliga exempel
- Publiceringskopplingen mot mottagarens Supabase verifierad utan att skriva live vid smoke-test
- Dubblett- och daglig idempotens per projekt/nyhet och en verkställbar maxkvot 2 artiklar/dag
- Godkänd, tidsbegränsad autonomilicens med stoppa-/återkalla-funktion, eller fortsatt mänskligt godkännande

Säkerhet: inga ändringar i main, andra projekt, IAM eller produktion från denna gren. Rensa tillfällig gren, Preview-deployments och branchvariabler efter överlämning.
