# Omnira Trading System – Provider Connectivity Reason Codes

**Nivå:** Trading Core — reason code-vokabulär
**Version:** Canonical v1.0
**Datum:** 2026-09-01
**Dokumentspråk:** Svenska (kod och identifierare på engelska)
**Status:** LÅST vokabulär. Prospektiv verkan.
**Föregångare:** Ingen. Detta är det första dokumentet i sitt slag.
**Källa:** Canonical Amendments v1.0, Beslut H
**Ersätter:** En mening i Execution Provider Adapter Canonical v1.2 §8 — se §7 nedan.

> **Detta dokument är provider-neutralt.** Det innehåller inga providernamn, inga
> endpointnamn, inga protokollnamn och ingen providerspecifik autentisering.

---

## §1. Varför detta dokument finns

Trading Cores reason code-register hade fram till nu exakt två providerkoder:
`PROVIDER_DISCONNECTED` och `SECURITY_DEGRADED`. De räckte så länge ingen kod faktiskt
höll en providersession vid liv.

R1A (provider session runtime) ändrade det. Runtimen kan skilja på nio olika sätt som en
session kan sluta på — men registret kunde inte uttrycka skillnaden. Sju av dem fick
rapporteras som `PROVIDER_DISCONNECTED`, och en autentiseringsvägran fick tillfälligt
rapporteras som `SECURITY_DEGRADED`.

Den kompromissen var medvetet märkt som tillfällig, och den var fel på två sätt:

1. **Den var förlustgivande.** En journalrad kunde säga att en session tog slut, men inte
   varför. En operatör som frågade "vägrade providern våra uppgifter, eller försvann
   nätet?" fick samma kod i båda fallen.
2. **`SECURITY_DEGRADED` betydde något annat.** v1.2 §8 definierar den som *credential
   bredare än begärt* — en least privilege-försvagning. Att återanvända den för
   "autentisering nekad" gjorde två olika observationer omöjliga att skilja åt i
   efterhand.

Detta dokument stänger luckan. Det gör en enda sak: det låser nio koder.

---

## §2. Omfattning

**Ingår:** nio kanoniska reason codes för providerkonnektivitet, deras exakta semantik,
och deras förhållande till de två koder som redan fanns.

**Ingår inte:** retry-policy, hälsobedömning, capability-semantik, auktoritet,
providerimplementation, transportimplementation. Inget av det ändras här.

Ingen befintlig kod byter namn. Ingen befintlig kod byter betydelse. Inget historiskt
värde omtolkas.

---

## §3. De nio koderna

Koderna tillhör `CORE_REASON_CODES`, bredvid de befintliga providerobservationerna. De är
observationer en sessionsruntime kan göra om en länk — inte strategibeslut, inte
riskbeslut, inte propbeslut och inte execution-auktoritet.

| Kod | Betydelse |
|---|---|
| `PROVIDER_CONNECT_FAILED` | Transporten/sessionen kunde inte etableras. |
| `PROVIDER_AUTHENTICATION_FAILED` | Transporten var etablerad, men autentiseringen nekades. |
| `PROVIDER_CONNECTION_LOST` | En tidigare etablerad session försvann oväntat. |
| `PROVIDER_HEARTBEAT_TIMEOUT` | Livstecken-policyn löpte ut utan begärd provideraktivitet eller kvittens. |
| `PROVIDER_PROTOCOL_ERROR` | Providerns meddelande eller handskakning kunde inte avkodas eller uppfyllas enligt det förväntade protokollkontraktet. |
| `PROVIDER_REMOTE_REJECTED` | Providern avvisade eller avslutade uttryckligen sessionen av ett maskinklassificerat skäl som **inte** enbart är nekad autentisering. |
| `PROVIDER_SESSION_CANCELLED` | Lokal avbrytning eller operatörsstopp. Inte ett fel, och inte i sig retry-bart. |
| `PROVIDER_RECONNECT_EXHAUSTED` | Den konfigurerade återanslutningsbudgeten förbrukades utan att en session återställdes. |
| `PROVIDER_FAILURE_UNKNOWN` | Ett konnektivitetsfel inträffade men kan inte hederligt klassificeras vidare. |

**Koderna är stabila och får aldrig döpas om.** En omdöpning är en brytande ändring för
varje historisk journalrad som använt värdet. Samma regel gäller redan hela registret;
den upprepas här därför att ett nytt dokument annars inbjuder till att tro att den inte
gäller ännu.

---

## §4. Maskinläsbar kod, mänsklig text

En kod är kontraktet. En eventuell text bredvid den är för människor.

`ProviderError` förblir exakt två fält: `reasonCode` och `message`. Inget
`providerCode`, ingen `retryable`, ingen HTTP-status, ingen transportstatus, ingen rå
payload och inget exception-objekt tillkommer. Providerspecifika strängar förblir
diagnostik och får aldrig bli beslutsunderlag — v1.2 §8 förbjuder det redan, och de nio
koderna finns just för att göra förbudet praktiskt möjligt att följa.

Ingen konsument får parsa prosa för att härleda en kategori.

---

## §5. Förhållande till `PROVIDER_DISCONNECTED`

`PROVIDER_DISCONNECTED` behåller sin befintliga semantik oförändrad: den generella
observationen att providern inte är ansluten, så som v1.2 §8 använder den.

Den blir **inte** en av de nio, och de nio ersätter den **inte** i befintliga
användningar. En adapter som i dag svarar `PROVIDER_DISCONNECTED` på "ej ansluten"
fortsätter att göra det.

Skillnaden i praktiken: `PROVIDER_DISCONNECTED` säger *att* providern inte är
tillgänglig. De nio säger *vad som hände med sessionen*. Det är två frågor, och en kod
som svarar på båda svarar inte tydligt på någondera.

---

## §6. Förhållande till `SECURITY_DEGRADED`

`SECURITY_DEGRADED` behåller sin befintliga semantik oförändrad: en credential som är
bredare än begärt — en least privilege-försvagning, i Fas 2 en varning och inte en block.

**`SECURITY_DEGRADED` betyder inte, och har aldrig betytt, att autentiseringen nekades.**
Nekad autentisering är `PROVIDER_AUTHENTICATION_FAILED`. R1A:s tillfälliga mappning från
`AUTH_FAILED` till `SECURITY_DEGRADED` var uttryckligen märkt som kompatibilitet i väntan
på detta dokument, och den tas bort i och med Beslut H.

---

## §7. Vad detta dokument ersätter

Execution Provider Adapter Canonical v1.2 §8 avslutas i dag med:

> `PROVIDER_DISCONNECTED` och `SECURITY_DEGRADED` är låsta i providervokabulären genom
> Beslut F och är ännu **inte** transkriberade till Trading Cores register. Det hör till
> Stage 1.8a. **Inga ytterligare reason codes tillkommer.**

Transkriptionen skedde i Stage 1.8a. Den sista meningen — *Inga ytterligare reason codes
tillkommer* — **upphävs härmed**, och endast den.

Allt annat i §8 står kvar oförändrat: tabellen över situationer och utfall, förbudet mot
providerspecifika felsträngar som beslutsunderlag, och rätten att bevara rå
providerresponse för journalen där det är säkert.

Skälet till att meningen upphävs är att den skrevs innan någon runtime existerade som
kunde observera skillnaderna. Den beskrev korrekt att Level 1-kontraktet inte behövde
fler koder. Den kunde inte förutse att en sessionsruntime skulle göra det.

---

## §8. Retry-policy ingår inte

En reason code får aldrig bära retry-semantik.

`PROVIDER_CONNECTION_LOST` betyder inte "försök igen". `PROVIDER_AUTHENTICATION_FAILED`
betyder inte "försök aldrig igen". Ingen ordning i §3 antyder rang eller allvarlighet.

Beslutet om ett fel är värt ett nytt försök ägs av runtimen och dess policy, separat från
vokabulären. Skälet är hållbarhet: en kod hamnar i historiska rader och måste betyda samma
sak om fem år, medan en retry-policy med rätta ändras när driftserfarenhet ändras. Att
frysa policyn i koden vore att frysa den för varje rad som någonsin skrivits.

---

## §9. Ingen auktoritet

Ingen kod i §3 skapar auktoritet.

En konnektivitetsobservation kan aldrig prägla `RiskClearance`, `PropClearance`,
`ApprovalGrant` eller `ExecutionIntent`. Att en session är etablerad, autentiserad och
vid liv är inte tillstånd att handla; det är förutsättningen för att över huvud taget
kunna observera något.

`PROVIDER_SESSION_CANCELLED` antyder inte heller att providern är osund, att den avvisat
något, eller att säkerheten försämrats. Det är kontext, inte eskalering.

---

## §10. `PROVIDER_FAILURE_UNKNOWN` får aldrig gissas bort

`PROVIDER_FAILURE_UNKNOWN` är fail-closed informationssanning: vi vet att ett
konnektivitetsfel inträffade, och vi vet inte vilken kategori det tillhör.

Den får **inte** befordras till en mer specifik kod genom slutledning, sannolikhet eller
prosatolkning. En gissad kategori är sämre än en ärlig avsaknad, därför att den i
journalen är omöjlig att skilja från en observerad.

---

## §11. Prospektiv verkan

Koderna gäller framåt, från och med att Beslut H landar.

Historiska rader som bär `PROVIDER_DISCONNECTED` eller `SECURITY_DEGRADED` förblir
giltiga och migreras inte. De omtolkas inte heller: en historisk
`PROVIDER_DISCONNECTED` betyder vad den betydde när den skrevs, och får inte i efterhand
läsas som `PROVIDER_CONNECTION_LOST`.

Ingen datamigrering hör till detta beslut.

---

## §12. Runtime-transkription

Registret ligger i `apps/web/lib/trading/reason-codes.ts`, i gruppen för
providerobservationer.

Provider session runtime översätter sitt interna `SessionFailure`-vokabulär till dessa
koder i exakt en funktion, `reasonCodeOf`. Översättningen är **total** — en ny
`SessionFailure` utan mappning är ett kompileringsfel — och **injektiv** — två failures
får aldrig peka på samma kod. Det andra villkoret är det som hindrar att den
förlustgivande kollapsen smyger tillbaka.
