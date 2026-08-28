# Provider Evaluation — Futures Execution

**Datum:** 2026-08-28
**Status:** Implementationsunderlag. **Inte canonical arkitektur.**
**Föranledde:** Canonical Amendments v1.0, Beslut E

> Detta dokument bevarar providerspecifik research. Det är **inte** normativt för
> arkitekturen. Den provider-neutrala gränsytan ligger i
> `specifications/execution-provider/`. Providerfakta åldras; arkitekturen gör det inte.

---

## Evidensgradering

| Grad | Innebörd |
|---|---|
| VERIFIED | Officiell providerdokumentation eller officiell support-/produktsida |
| LIKELY | Konsistent över flera oberoende sekundärkällor, ej funnet i officiella dokument |
| UNKNOWN | Ej fastställt av tillgängliga publika källor |
| REQUIRES CONFIRMATION | Avgörbart endast med konto, avtal eller kommersiell kontakt |

**Källbegränsning som påverkade researchen.** `rithmic.com` är helt JavaScript-renderad;
`/apis`, `/faq` och `/tradersanddevelopers` returnerade endast sidtitel vid automatiserad
hämtning, och arkivtjänster var inte nåbara. Rithmic-fakta nedan vilar därför på oberoende
korroborering, inte på primärkällan.

---

## De fyra lagren

Att blanda ihop dessa var vad som producerade det ursprungliga MT5-felet.

| Lager | Roll | Är det ett adaptermål? |
|---|---|---|
| **TradeSea** | Front-end och analys ovanpå Rithmic | **Nej** — peer till Omnira |
| **Rithmic** | Execution transport, market data, order routing | **Ja** — valt först |
| **Broker / FCM** | Clearing och kontoinfrastruktur | Nej — sponsrar produktion |
| **Prop firm** | Äger det funded kontot och dess regler | Nej — GATE-09 |

**TradeSea är inte en execution provider.** Egen disclaimer: bolaget "is not a financial
broker, financial advisor, financial manager or a financial representative." VERIFIED
Ansluter till Rithmic med credentials traderns prop firm eller broker redan utfärdat.
VERIFIED Inget publikt developer-API dokumenterat. LIKELY

---

## Rithmic R|Protocol — valt första mål

| Fakta | Grad |
|---|---|
| WebSockets + Google Protocol Buffers | VERIFIED |
| Wire spec, inte kompilerad programvara — valfritt språk, valfritt OS | VERIFIED |
| Utvecklad för webb och mobil; lämpar sig för cloud/backend | VERIFIED |
| Samma funktionalitet som R\|API+ | VERIFIED |
| Server-side trailing stops, brackets, OCO, conditional release | VERIFIED |
| Fungerande open source-klienter finns i Python och Rust | VERIFIED |

### Åtkomstmodell

| Steg | Fakta | Grad |
|---|---|---|
| 1 | Dev kit begärs **direkt från Rithmic** | LIKELY |
| 2 | Begäran anger namn, företag/juridisk person, adress, telefon, e-post, API-flavor, avsedd användning | VERIFIED via oberoende brokerkälla |
| 3 | Utveckling sker mot **Rithmic Test** | VERIFIED |
| 4 | **Conformance krävs inte för Rithmic Test** | LIKELY |
| 5 | **Conformance krävs före produktionssystem inklusive Rithmic Paper Trading** | LIKELY |
| 6 | Efter conformance involveras FCM/broker för produktionscredentials och avgifter | LIKELY |

**Broker/FCM-sponsring är inte ett förvillkor för dev kit eller Test.** En tidigare
version av denna research generaliserade Ironbeams onboarding till en universell
Rithmic-regel. Det var fel och är tillbakadraget — Ironbeams $500-konto är *Ironbeams* väg,
inte Rithmics krav. Vissa brokers erbjuder att vidarebefordra begäran som en tjänst; det är
en bekvämlighet, inte en grind.

### Avgifter

Broker-beroende. Ironbeam publicerar $25/mån connection och $0.10/kontrakt routing, med
non-professional Level 1-data från $3/mån per exchange. En separat siffra kring $100/mån
för API förekommer i sekundärkällor. REQUIRES CONFIRMATION

**Ingen avgift beskrivs i något underlag för att begära dev kit.** LIKELY

---

## Tradovate — planerad andra adapter

| Fakta | Grad |
|---|---|
| REST `demo.tradovateapi.com/v1` och `live.tradovateapi.com/v1` — environment separerat på hostnamn | VERIFIED |
| WebSocket för subscriptions; separat `md`-host för market data | VERIFIED |
| Token 90 min, förnyas ~85 via `renewAccessToken`, förlänger sessionen | VERIFIED |
| Kontraktsupptäckt via `/contract/suggest` och `/contract/find`; orders kräver fullt kontraktsnamn | LIKELY |
| Permission scopes sätts per API-nyckel | LIKELY |
| Exakta scope-namn, och om read-only kan utesluta orderläggning | REQUIRES CONFIRMATION |
| Personlig API-access kräver live-konto ≥ $1,000 + $25/mån | VERIFIED |
| Gratis 14-dagars demo finns, men **utan** API-access | VERIFIED |
| Simuleringssaldon räknas inte mot kravet — $1,000 gäller även för API-mot-simulering | LIKELY |
| Realtidsdata via API kräver CME sub-vendor-registrering; orderläggning gör det inte | VERIFIED (kravet) |
| Aktuell CME-avgiftsklass och belopp | REQUIRES CURRENT CME CONFIRMATION |

### Prop- och evaluation-konton

Tidigare påstående att Tradovate inte ger API-access till prop- eller evaluationkonton var
för kategoriskt och är **tillbakadraget**.

| Fakta | Grad |
|---|---|
| Tradovate driver en separat **Partner API** med prop firm-hantering, `createEvaluationUsers`, `/user/createEvaluationAccounts`, partner-nyckelautentisering och egen conformance-sektion | VERIFIED |
| Den infrastrukturen är **prop firmans** integration, inte slutanvändarens | LIKELY |
| Att en personlig API-nyckel normalt inte når ett tredjeparts funded konto | LIKELY |
| Vilka firmor som kan aktivera end-user API-access, om det kan slås på per konto, och om det sker via personlig nyckel, OAuth-partnerintegration eller evaluation-partner-infrastruktur | REQUIRES PROVIDER OR PROP CONFIRMATION |

---

## ProjectX — utvärderad, ej vald

REST + WebSocket, JWT med 24-timmars session, publik dokumentation. Två diskvalificerande
fynd:

- Sessionstoken "will grant full access to the Gateway API" — **ingen read-only-scope**. VERIFIED
- Tredjeparts prop firm-licensiering upphörde 28 feb 2026; produkten är nu **exklusiv för
  Topstep**. VERIFIED Att välja den skulle binda Omniras execution-lager till en enda
  prop firm — motsatsen till vad Beslut D korrigerade.

---

## Kvarvarande unknowns

Rithmic Tests faktiska omfattning · Tradovates scope-namn · om Tradovate demo-API kan
undvika $1,000-kravet · fill- och orderhistorikens retention hos båda · rate- och
connection-limits · R\|Protocols exakta meddelandeuppsättning, reconnect- och
sequence-recovery-semantik · aktuell CME-licensklass för Omniras användningsfall · vilka
prop firms som aktiverar end-user API-access.

**Ingen av dem är en arkitekturblockerare.** Samtliga uttrycks genom
`ProviderCapabilities`, `Available<T>`, `FillHistory.completeness` eller `CredentialMode` i
det provider-neutrala kontraktet.

---

## Officiella källor

api.tradovate.com · partner.tradovate.com · github.com/tradovate/example-api-faq ·
rithmic.com/apis · rithmic.com/tradersanddevelopers · gateway.docs.projectx.com ·
tradesea.ai · ironbeam.com · support.edgeclear.com · community.tradovate.com
