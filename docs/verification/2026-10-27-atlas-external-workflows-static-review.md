# Atlas externa arbetsflöden – strukturell stickprovsgranskning

**2026-10-27. Read-only research, ej kod-/säkerhetsgodkännande.**

## Avsikt och begränsning
Fyra enskilda JSON-filer hämtades från den **fastlåsta** externa källversionen
`94007c1445d9258a7da116646b79473e7c7c3282` med `redirect: error` och begränsad storlek. Ingen fil importerades
till n8n/Omnira, inga credentials användes, inga API-anrop i deras innehåll
kördes, och ingen verklig kontakt gjordes. Strukturen analyserades enbart
som JSON-data. Noder + anslutningar bevisar **inte** korrekt eller säkert flöde.

| Kandidat / originalkälla | Noder | Kopplade källnoder | Kanter | Säkerhets-/produktbedömning |
| --- | ---: | ---: | ---: | --- |
| [Lead Qualification with BatchData](https://github.com/Zie619/n8n-workflows/blob/94007c1445d9258a7da116646b79473e7c7c3282/workflows/Code/1910_Code_Webhook_Automation_Webhook.json) | 17 | 6 | 26 | Webhook, flera HTTP-anrop och kodnod. Behöver extern leverantörs-/licens-/kostnadsgranskning. Endast idén om klassning är relevant. |
| [Property Lead Contact Enrichment from CRM](https://github.com/Zie619/n8n-workflows/blob/94007c1445d9258a7da116646b79473e7c7c3282/workflows/Emailsend/1628_Emailsend_Code_Automation_Webhook.json) | 16 | 4 | 15 | Innehåller `emailSend`, kodnoder och schematrigger. Får inte användas till Handlarbörsens skarpa leads. |
| [AI Email processing autoresponder with approval](https://github.com/Zie619/n8n-workflows/blob/94007c1445d9258a7da116646b79473e7c7c3282/workflows/Emailreadimap/1284_Emailreadimap_Markdown_Send.json) | 18 | 5 | 19 | Har en godkännanderelaterad namngiven nod, men även `emailSend` och 7 noder med credential-referenser. Indexet anger 17 noder (inaktuell metadata). Återanvänd **mönster**, aldrig flödet direkt. |
| [Get Comments from Facebook Page](https://github.com/Zie619/n8n-workflows/blob/94007c1445d9258a7da116646b79473e7c7c3282/workflows/Splitout/1058_Splitout_Code_Import_Triggered.json) | 11 | 2 | 18 | Facebook Graph API och kodnod, två credential-referensnoder. Potentiell inspiration för svarsförslag i Familje-Stunden, inte automatiska svar. |

Antal credential-referensnoder är **inte** antalet exponerade hemligheter.
Auditens summering innehåller inga hemlighetsvärden eller råa uttryck.
Källrepos MIT-deklaration gäller inte nödvändigtvis ursprung och villkor för
alla insamlade, tredjepartsägda workflowfiler. Granska fil för fil innan
något kopieras.

## Handlarbörsen – rekommenderad förbättring (förslag, inget aktivt utskick)

Använd befintliga Atlas/Omnira-komponenter för ett säkert beslutsflöde, i
stället för att installera n8n eller skriva om Handlarbörsens Lead Finder.

`discovered -> SCB_verified_company -> privacy_and_history_review -> suggested_draft
-> operator_review -> (future) guarded_send -> delivery_receipt -> follow_up_review`

**Hård aktuell spärr:** SCB-urvalet har 90 unika organisationer från två
granskningsfiler, men ingen rad är kontaktgodkänd. Kodtabeller för
marknadsföringsspärrar och fullständig historik för tidigare kontakt måste
valideras i den separata HB-arbetsgrenen. Ingen kontaktbarhet får härledas från
företagsstatus eller automatisk poängsättning.

### Föreslagna acceptanskriterier för senare isolerad implementation
1. Syntetiska testfall kan klassificeras och få *utkast*, aldrig leverans på
   otestade eller historiskt okända företag.
2. Manuellt avslag och manuellt godkännande registreras med operator-ID,
   tidsstämpel, version och granskat innehåll.
3. Alla externa effekter ligger bakom befintliga projekt-/auktorisationsgrindar
   och separat allowlist; inget kampanjutskick introduceras av denna PR.
4. Dubbletter per organisation och kanal hanteras, med återkörningsskydd och
   explicit status för misslyckad/skickad leverans (faktiskt kvitto).
5. Varje granskad referens länkas med originalkälla, fast Git-revision,
   uppgivet ursprung/licens och vad som faktiskt verifierats.
6. Den parallella HB-arbetsgrenen och historikregistret förblir orörda.

## Beslut i denna PR
**Endast underlag.** PR #564 utökar en skrivskyddad Atlas-sökkatalog.
Granskningen ger inte lov att aktivera en ny agent, scheduler, e-postleverantör,
Meta Graph-koppling, företagsregisteruppslag eller externa sidoeffekter.
