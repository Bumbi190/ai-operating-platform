# Omnira — CTO & Produktarkitekt: Gap-analys & Roadmap (Fas 5–7)

_Datum: 2026-06-02. Skriven utifrån faktisk kod och data, inte intentioner. Ingen kod byggd — detta är en bedömning._

---

## Den obekväma huvudtesen (läs denna först)

Omnira är ett **imponerande automations- och intelligens-chassi med EN fungerande motor** — The Prompts innehållspipeline. Den motorn fungerar nu tillförlitligt (token-buggen löst, postar till IG/FB/YouTube två gånger om dagen).

**Men:** den motorn producerar innehåll som **ingen ser** (3 följare) och som tjänar **0 kr**. De två verksamheter som var tänkta att tjäna pengar — **Familje-Stunden** (produktintäkt) och **GainPilot** (B2B-leads) — är i praktiken **tomma skal**: namn och profiler, ingen pipeline, inga kunder, inga intäkter.

Samtidigt är intelligens-lagren (Cost, Growth, Opportunity, BI) **längre fram än värdeskapandet**. Vi mäter en maskin som inte transakterar.

Som startup-CTO är min tydligaste rekommendation: **sluta polera maskinen och bygg en intäktsrörelse.** Den största risken just nu är inte teknisk — det är att fortsätta bygga observability och dashboards för ett system som inte säljer något. Nästa fas måste få **en** verksamhet att faktiskt ta betalt, och koppla in intäkts-/lead-data så Atlas kan mäta verklig ROI. Allt annat är sekundärt.

---

## Mognadsmatris (0–100%)

| Område | Mognad | Fungerar idag | Saknas | Affärspåverkan | Prioritet |
|---|---:|---|---|---|---|
| **Atlas (Chief of Staff)** | 65% | Identitet, Context Brain (enad live-bild), Executive Summary, chatt med verktyg (workflows/ask_manager/delegate), röst (nyss fixad) | Surfar inte Growth/Content/Opportunity; agerar inte (skapar bara task-rader); grund minne | Hög (produktens ansikte) | Medel |
| **Business Intelligence** | 55% | Kostnad per projekt/leverantör, aktivitet, social-grund, enad kontext | Intäkt + leads tomma → halvblind; ingen per-verksamhet-P&L | Hög | **Hög** |
| **Growth Intelligence** | 20% | Content Score, följar-snapshot (1 dag), topic-taggning | Tidsserie, signaler, project health, publikdata | Medel (spelar roll först när det finns publik) | Låg nu |
| **Revenue Intelligence** | 5% | Schema + kontext-plumbing | All ingestion + alla intäkter | **Kritisk** | **Högst** |
| **Lead Intelligence** | 10% | `leads`-tabell + `POST /api/leads` | Källa som matar in, kvalificering, CRM | Hög (GainPilots kärna) | **Hög** |
| **Social Analytics** | 40% | Per-inlägg IG-insights | FB/YT konto-mått, följar-serie (nyss start), benchmark | Medel | Låg–medel |
| **Opportunity Engine** | 25% | Samlar + poängsätter + ärlig tröskling | Riktiga detektorer, åtgärder, UI | Låg tills data finns | Låg |
| **Agent Management** | 60% | Workflows, agents, run-motor, Manager Agent, delegate→tasks, Activity Center | Agenter utför inte delegerade tasks autonomt; ingen återkopplingsloop | Medel–hög | Medel |
| **Voice Assistant** | 75%* | Kontinuerlig dialog, streaming, latensmätning, korta svar (nyss fixat) | "Barge-in" (avbryta talet), verifiering i drift, mobil | Medel (delight, ej intäkt) | Låg (frys efter verifiering) |
| **Cost Tracking** | 85% | Verklig SEK per leverantör/projekt/agent, Cost Center, budgetvakt | Infra/abonnemang delvis, larm | Medel | **Klar — rör ej** |
| **Workflow Automation** | 70% | Motor (runStep), cron-medierpipeline robust, kvalitetsgate | Generiska/användardefinierade flöden, felåterhämtning | Medel | Medel |
| **Content Automation** | 85% | End-to-end nyhet→publicering på 3 plattformar, kommentarssvar, 2×/dag | Distribution/publiktillväxt (ej produktionen) | Hög (det fungerande tillgången) | **Klar — rör ej produktionen** |
| **The Prompt (verksamhet)** | 50% | Innehållsmaskinen | Publik (3 följare), monetisering (0 kr), distributionsstrategi | Varumärke/långsiktigt | Medel |
| **Familje-Stunden (verksamhet)** | 10% | Inget byggt (bara profil) | Allt: produktpipeline, checkout, leverans | **Hög** (tydligast betald produkt) | **Hög kandidat** |
| **GainPilot (verksamhet)** | 10% | Inget byggt (bara profil) | Lead-gen-rörelse, outreach, kvalificering, konvertering | **Hög** (B2B kan ge stora SEK snabbt) | **Hög kandidat** |

\* Voice: mognad efter dagens fix, ännu inte verifierad i skarp drift.

---

## Kategorisering

**Helt färdigt (och bör frysas):**
- Cost Tracking + Cost Center.
- The Prompts innehållsproduktion (nyhet→manus→röst→render→publicering IG/FB/YouTube + kommentarssvar).
- Token-/postnings-infrastrukturen (no-store-fixen, YouTube-härdningen).
- Atlas konversations- och röst-kärna (efter verifiering).

**Delvis färdigt:**
- Atlas (saknar att surfa ny intelligens + att agera).
- Business Intelligence (halvblind utan intäkt/leads).
- Social Analytics (per-inlägg ja, konto/serie nej).
- Agent Management (delegerar men exekverar inte autonomt).
- Workflow Automation (medier ja, generiskt nej).

**Endast scaffold/förberett:**
- Growth Intelligence (4a-grund).
- Opportunity Engine (samlar, agerar ej).
- Revenue Intelligence (schema utan data/ingestion).
- Lead Intelligence (endpoint utan källa).

**Saknas helt för en verklig AI Chief of Staff:**
- En **intäktsrörelse** i minst en verksamhet (det enskilt viktigaste).
- **Intäkts- och lead-ingestion** (Stripe-webhook / lead-källa) → utan detta är ROI alltid 0x och Atlas kan aldrig svara på "tjänar vi pengar?".
- **Handlingskraft** hos Atlas: idag rapporterar/föreslår den, men stänger inte loopen till utförd åtgärd.
- Per-verksamhet **P&L** och kassaflöde.

---

## Vad som redan är "tillräckligt bra" — utveckla INTE vidare nu

- **Cost Tracking** — löser sitt jobb. Lägg ingen tid här.
- **The Prompts produktionspipeline** — den fungerar. Bygg inte fler steg/kvalitetslager; problemet är distribution & monetisering, inte produktion.
- **Voice Assistant** — nyss fixad. Verifiera i drift, lämna sedan. Bygg inte barge-in/avancerat ännu.
- **Growth Intelligence 4b** — vänta. Utan publik och tidsserie skapar fler tillväxt-dashboards inget värde. Detta är den klassiska fällan: att bygga mätverktyg i stället för intäkt.

---

## Roadmap — Fas 5, 6, 7 (sorterad: affärsvärde → snabbast intäkt → minst risk)

### FAS 5 — "Första intäktsrörelsen" _(högst värde · snabbast cash · låg-medel risk)_
Mål: få **en** verksamhet att ta betalt, end-to-end, och göra intäkts-/lead-data verklig.

1. **Välj EN verksamhet att monetisera först.** (CTO-rekommendation nedan.) Bygg den minimala betalvägen hela vägen: efterfrågan → leverans → registrerad intäkt. Inget fler-affärs-bygge.
2. **Intäkts-ingestion:** Stripe-webhook → `revenue_events` (eller manuell `/api/revenue` som brygga). Detta är nyckelstenen — den låser upp Revenue + BI med riktig data direkt.
3. **Lead-ingestion:** en faktisk källa (formulär/landningssida/outreach) → `leads`, med kvalificeringsstatus.
4. Resultat: Atlas kan för första gången svara "tjänar vi pengar, och var?" — och ROI slutar vara 0x.

_Varför först: störst affärsvärde (intäkt > insikt), snabbaste vägen till cash, och tekniskt lågrisk (plumbing + en rörelse, ingen ny ML)._

### FAS 6 — "Atlas agerar och mäter" _(hävstång på befintligt chassi)_
Mål: omvandla intelligens till handling och full ekonomisk bild.

1. **Surfa Growth/Content/Opportunity i Atlas** (wiringen jag medvetet sköt upp) → Atlas svarar "hur går X / vad bör jag göra".
2. **Stäng loopen:** delegate→`manager_tasks` ska faktiskt **utföras** av agenter, inte bara loggas.
3. **Per-verksamhet P&L** nu när intäkt/leads flödar.

### FAS 7 — "Skala det som funkar" _(efter att en rörelse bevisats)_
1. **Growth 4b** (signaler, timeline, project health) — meningsfullt nu med veckors data + publik.
2. Andra verksamhetens rörelse + distributionsmotor för The Prompt.
3. Opportunity → automatiserad åtgärd.

---

## CTO-rekommendation: vilken verksamhet monetiseras först?

Detta beror på tillgångar jag inte ser (befintliga kunder, säljkapacitet, leveranskapacitet) — så slutvalet är ditt. Men kriterierna och min lutning:

- **Familje-Stunden** — tydligast *betald produkt* (premium personaliserat barninnehåll, paket). Snabbast "produkt→kassa" om leverans kan halv-automatiseras och en enkel checkout finns. **Min lutning om du vill ha intäkt snabbast med lägst beroende av säljarbete.**
- **GainPilot** — högst *intäkt per affär* (B2B), men kräver en säljrörelse (outreach/kvalificering/möten). Snabb om du redan har pipeline/nätverk; långsammare från noll.
- **The Prompt** — varumärkes-/publikspel. Monetisering kommer *efter* publik → långsammast väg till cash. Behåll som autopilot, investera inte i monetisering förrän publiken vuxit.

Rekommendation: **välj Familje-Stunden eller GainPilot för Fas 5** beroende på om du vill luta mot produktintäkt (Familje) eller affärsintäkt (GainPilot). Låt The Prompt fortsätta rulla på autopilot under tiden.

---

## Sammanfattning i en mening

Omnira har byggt hjärnan och en motor — nästa fas måste bygga **plånboken**: en verksamhet som tar betalt och datan som låter Atlas se det. Bygg intäkt, inte fler dashboards.
