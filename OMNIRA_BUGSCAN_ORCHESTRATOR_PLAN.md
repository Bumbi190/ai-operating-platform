# Omnira — Buggövervakning: push + daglig scan (PLAN v2, ingen kod ännu)

**Datum:** 2026-06-06
**Repo:** `Bumbi190/ai-operating-platform` (Omnira / AI Operating Platform)
**Status:** Förslag för granskning. Inget byggs förrän du godkänt.

---

## 1. Beslutad inriktning

- **Severitetsstyrd push:** bara **akuta** fel mailar dig direkt. Allt annat samlas tyst i panelen på `/atlas` och ses när du loggar in. Ett mail = "agera nu".
- **Daglig "tyst-fel"-scan** matar panelen (ingen mail för icke-akuta fynd).
- **Nära noll löpande kredit:** ingen LLM körs på rutin. Vare sig push eller daglig scan anropar Claude automatiskt.
- **Fix-prompt = mall (gratis)** med en valfri **"Förbättra med AI"-knapp** — Claude körs bara när *du* klickar.
- **Allt samlat i Omnira:** ett register + en historik-vy, så alla projekt och deras buggar finns på ett ställe.

Princip: **upptäcka buggar är gratis** (runtime-koll + felfångst, ingen kod- eller AI-kostnad). **Fixa buggar** sker i Claude-chatten med repo monterat — dit tar du mallen.

### Severitets-routing (förslag att bekräfta)

| Nivå | Exempel | Vad händer |
|---|---|---|
| 🔴 **Akut (kritisk)** | Sajt/API nere, betalnings-/Stripe-fel, ≥3 misslyckade körningar, trasig auth, användarrapport "kan inte använda appen" | **Mail direkt** + panel |
| 🟡 **Varning** | Enstaka misslyckad körning, scanner-varning, cron sen, antal som rasat, saknad icke-blockerande config | **Bara panel** |
| 🟢 **Info / feedback** | Vanlig användarfeedback, mindre avvikelser | **Bara panel** |

---

## 2. De två modellerna fångar olika saker

| | **Push (direktmail)** | **Daglig scan** |
|---|---|---|
| Fångar | Aktiva fel: krascher, misslyckade körningar, 500-fel, **användarrapporterade** buggar | Tysta försämringar: cron som inte kört, saknad nyckel, antal som rasat, endpoint som svarar med fel data |
| Tajming | Omedelbart när det smäller | En gång per morgon (kan bli var 12:e h) |
| Kostnad | ~0 (ett mail per händelse) | ~0 (HTTP-checks, ingen LLM) |
| Vem hittar annars? | Ofta användaren | Ingen — bara periodisk koll |

De ersätter inte varandra. Push = "något gick sönder nu". Daglig scan = "något har tyst slutat fungera".

---

## 3. Nuläge att bygga på

| Byggdel | Finns | Fil |
|---|---|---|
| Startsida | ✅ | `app/(platform)/atlas/page.tsx` |
| Briefing-UI (🔴🟡🟢-rader) | ✅ | `components/platform/os/ExecutiveBriefing.tsx` |
| Dagligt cron + lagring (mönster) | ✅ | `app/api/media/cron/morning-briefing/route.ts` → `morning_briefings` |
| Projektlista | ✅ | tabell `projects` |
| Misslyckade körningar loggas redan | ✅ | `runs.status='failed'` (push-grunden finns delvis) |
| Mail | ✅ | `lib/email/brevo.ts` (`sendAdminNotification`) |
| Vercel cron | ✅ | `vercel.json` |
| Projekt-scanners | ✅ | varje sajts egna `/api/bugscanner/run` |

**Bör fixas oavsett (steg 0):** AOP:s deployade scanner släpar efter koden — dagens 3 varningar (Arnold/inköpslistor) är spöken från gammal deploy; lokala `checker.ts` har redan tagit bort dem. Omdeploy rensar. Och `route-manifest.json` flaggar `/bugscanner/run` som global/ej verifierad → orchestratorn måste byggas per-projekt-isolerad.

---

## 4. Del A — Push (direktmail)

### 4.1 Systemfel
En liten central helper, t.ex. `reportBug({ project_id, source:'system', severity, title, detail })`, som:
1. skriver raden till `bug_reports` (project_id-scopat),
2. **om severity = akut (🔴):** mailar dig direkt via Brevo (med **debounce**: samma fel inom X min buntas).
3. **annars (🟡/🟢):** ingen mail — visas bara i panelen.

Anropas från de ställen fel redan fångas — främst där `runs` sätts till `failed`, samt i en global error-handler för API-routes. Ingen LLM.

### 4.2 Användarrapporterade buggar
En **"Rapportera bugg"-funktion i ALLA projekt** (Omnira, Gainpilot, Familje-Stunden) som POST:ar till en gemensam endpoint → samma `reportBug()` med `source:'user'`. Hamnar i samma samlade vy i Omnira. Mail bara om rapporten markeras akut (t.ex. "kan inte använda appen"), annars panel.

> Obs: UI:t byggs i respektive repo (Gainpilot/Familje), men alla skickar till samma format/endpoint. Det håller "allt samlat i Omnira" utan att bryta per-projekt-isoleringen.

---

## 5. Del B — Daglig scan (orchestrator)

### 5.1 Scanner-register `project_scanners`
| kolumn | beskrivning |
|---|---|
| `project_id` | FK → projects |
| `scanner_url` | t.ex. `https://gainpilot.se/api/bugscanner/run` |
| `secret_env_key` | namn på env-varianten (secreten lagras **inte** i DB) |
| `enabled` | på/av |

Seedas med dina tre scanners. Nytt projekt = en rad → därför "allt samlat".

### 5.2 Orchestrator `/api/bugscanner/scan-all`
- Skyddad med `CRON_SECRET`. Triggas av Vercel cron 07:00.
- Loopar registret, anropar varje projekts **egna** scanner med dess **egna** secret (`Promise.allSettled`).
- Normaliserar de tre olika svarsformaten till ett gemensamt.
- **Diff** mot förra körningen → flaggar bara *nya* fynd (24h).
- Sparar i `bugscan_runs` / `bugscan_findings`. Ingen LLM.

### 5.3 Morgon-popup på `/atlas`
- Klientkomponent `MorningBugPopup`, monteras i `atlas/page.tsx`.
- Visar **nya fynd senaste 24h** (kort lista) + länk till full historik. Allt grönt → kort grön bekräftelse.
- Visas en gång per morgon (`last_seen_bugscan_at` på användaren).

---

## 6. Fix-prompt: mall + "Förbättra med AI"

Varje fynd (push eller scan) har en **färdig mall** — genereras lokalt, ingen kostnad:

```
Projekt: {projekt} ({domän})
Upptäckt {datum}: "{check/titel}" — status {STATUS}
Symptom: {message}
Sannolikt område: {endpoint/tjänst om känt}
Repro: {hur man återskapar}

Uppgift: hitta rotorsaken innan fix föreslås, håll per-profil-isolering,
ändra inga orelaterade filer, kör build/test före commit.
```

Knappar i popupen/mailet: **"Kopiera"** (gratis, alltid) och **"Förbättra med AI"** (kör Claude *bara* när du trycker — betalar per klick, inte per natt).

---

## 7. Datamodell (sammanfattning)

- `project_scanners` — registret (Del B).
- `bug_reports` — push-händelser: `id, project_id, source('system'|'user'), severity, title, detail, fix_prompt, created_at, resolved_at, emailed_at`.
- `bugscan_runs` + `bugscan_findings` — daglig scan-historik + diff-underlag.

Allt `project_id`- (och `owner_id`-) scopat. Push och scan kan visas i samma samlade Omnira-vy.

---

## 8. Isolering & säkerhet

- Varje projekt scannas via sin egen endpoint + secret; Omnira korsar aldrig in i annat projekts DB.
- Resultat scopat på `project_id`/`owner_id`.
- Orchestrator + report-endpoint skyddas (CRON_SECRET resp. inloggad admin / app-secret).
- Uppdatera `route-manifest.json` så bugscanner-raderna verifieras.

---

## 9. PR-sekvens

- **PR 0 — Deploy-fix:** omdeploya AOP, rensa spökvarningar.
- **PR 1 — Datamodell:** migrationer (`bug_reports`, `project_scanners`, `bugscan_runs`, `bugscan_findings`) + seed.
- **PR 2 — Push systemfel:** `reportBug()` + Brevo-mail + debounce, kopplat på `runs failed` + global API-error-handler.
- **PR 3 — Användarrapport:** report-endpoint + enkel "Rapportera bugg"-knapp (börjar med Omnira själv).
- **PR 4 — Orchestrator + cron:** `/api/bugscanner/scan-all`, diff, lagring, Vercel cron.
- **PR 5 — Startsido-popup:** `MorningBugPopup` + hämtnings-API + "visad denna morgon".
- **PR 6 — Mall-prompt + "Förbättra med AI"-knapp.**

Build + test före varje commit.

---

## 10. Beslutat

1. ✅ **Repo:** byggs i `AI Operating Platform` (Omnira). Andra mappar bara kontext.
2. ✅ **Push:** severitetsstyrd — bara akuta (🔴) mailar direkt (med debounce), resten i panelen.
3. ✅ **Användarrapport-knapp:** in i **alla projekt** (Omnira, Gainpilot, Familje-Stunden).
4. ✅ **Fix-prompt:** mall (gratis) + "Förbättra med AI"-knapp (kör Claude bara på klick).

### Kvar att bekräfta
- **Akut-tröskeln** (tabellen i avsnitt 1): stämmer den, eller vill du flytta något mellan 🔴 / 🟡?
