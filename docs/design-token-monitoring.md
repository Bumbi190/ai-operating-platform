# Design: Proaktiv token-monitorering & larm (punkt 1)

**Status:** Design för godkännande. Ingen implementation ännu.
**Mål:** alltid veta dagar till utgång, senaste lyckade refresh, status i Operations Center, och larm *innan* ett token dör — för Instagram, Facebook, YouTube.

---

## Nuläge (grunden designen måste hantera)

De tre plattformarna har **olika utgångsmodeller** — en enda "dagar till utgång" passar inte rakt av:

| Plattform | Var token finns idag | Utgångsmodell | Spårbar utgång? |
|-----------|----------------------|---------------|-----------------|
| **Instagram** | `platform_tokens` (row finns, `expires_at` = 2026-08-01) | Long-lived, ~60 dagar, förnyas via `ig_refresh_token` | ✅ Ja — `expires_at` finns |
| **Facebook** | Endast env (`FACEBOOK_PAGE_ACCESS_TOKEN`) | Page-token från long-lived user-token; "löper normalt inte ut" men kan ogiltigförklaras | ⚠️ Nej idag — ingen metadata sparas |
| **YouTube** | Endast env (`YOUTUBE_REFRESH_TOKEN`) | OAuth refresh-token → byts mot kort access-token per anrop. Refresh-token dör bara vid återkallande / 6 mån inaktivitet | ⚠️ Inte "dagar" — snarare giltig/ogiltig |

Befintligt att bygga på: `sendTokenExpiryWarning(platform, daysLeft, expiresAt)` finns redan i `alert.ts`; `refresh-tokens`-cronen förnyar IG månadsvis; `token-store` läser `expires_at`.

---

## 1. Datamodell (liten utökning av `platform_tokens`)

Gör `platform_tokens` till sanningskälla för **alla tre** (inte bara IG). Lägg till rader för Facebook och YouTube, och fält för monitorering:

```
alter table platform_tokens add column last_refreshed_at  timestamptz;  -- senaste lyckade refresh/rotation
alter table platform_tokens add column last_verified_at   timestamptz;  -- senaste lyckade giltighetskoll
alter table platform_tokens add column health_status       text;        -- 'ok' | 'warning' | 'expired' | 'error'
alter table platform_tokens add column last_error          text;
alter table platform_tokens add column last_warned_at      timestamptz;  -- dedupe av larm
```

Facebook/YouTube får rader vars `access_token` får vara null (de bor i env) — raden används för *metadata* (status, expires_at, senaste verifiering). Det undviker att flytta hemligheter men ger en enhetlig vy.

---

## 2. Token-health-checker (ny cron, dagligen)

Ny endpoint `/api/media/cron/token-health` + cron `omnira_token_health` **dagligen 06:15 UTC** (separat från månads-refreshen). Per plattform:

**Instagram**
- Läs `expires_at` ur `platform_tokens`. `daysLeft = (expires_at - now)/dygn`.
- Verifiera liveness med ett billigt `GET /me` (valfritt). Uppdatera `last_verified_at`, `health_status`.

**Facebook**
- Om `META_APP_ID`/`META_APP_SECRET` finns: anropa `GET /debug_token?input_token=<page>&access_token=<app_token>` → ger riktig `data_access_expires_at`/`expires_at` → räkna `daysLeft`, skriv till raden.
- Annars (creds saknas): liveness-koll med `GET /me?access_token=<page>` → status `ok`/`expired`, men `daysLeft` = okänt (visas som "giltigt, utgång okänd").

**YouTube**
- Försök refresh-exchange (samma som `youtube.ts` redan gör: `refresh_token` → access-token). Lyckas = `ok`, `last_verified_at` = now. Misslyckas = `expired`/`error` + larm.
- `daysLeft` är inte meningsfullt (refresh-token är långlivat) → visa "giltigt" + "senast verifierad".

Varje plattform skriver `health_status`, `last_verified_at`, ev. `expires_at`, `last_error`.

---

## 3. Tröskelvärden + notifiering

Larma via befintlig `sendTokenExpiryWarning` (mail), med **upptrappning och dedupe**:

| daysLeft | Åtgärd |
|----------|--------|
| ≤ 14 | Första varning (en gång) |
| ≤ 7  | Påminnelse |
| ≤ 3  | Daglig varning |
| ≤ 0 / ogiltig | Kritiskt larm + markera `expired` |

Dedupe via `last_warned_at` (max ett mail per tröskel/dygn). YouTube/FB utan `daysLeft`: larma bara vid `expired`/`error` (verifiering misslyckas).

**Härdningsförslag (rekommenderas):** öka IG-refreshen från **månadsvis → veckovis**. Refresh är idempotent och säker; månadsvis ger ett för stort fönster (vi såg redan ett dött IG-token denna vecka).

---

## 4. Status i Operations Center

Ny panel "**Integrationer & Tokens**" i `/atlas/operations` (läser `platform_tokens`):

```
Instagram   ● ok        utgång om 59 dagar   · refresh 27 maj   · verifierad idag 06:15
Facebook    ● ok        utgång okänd*        · —                · verifierad idag 06:15
YouTube     ● ok        långlivat            · —                · verifierad idag 06:15
```

Färgkod: grön (`ok`), gul (`warning`, ≤14 d), röd (`expired`/`error`). Samma rad-data injiceras i Atlas live-kontext så Atlas kan svara *"Håller våra tokens?"*, *"När går Instagram-token ut?"*, *"Är något token på väg att dö?"*.

---

## 5. Vad designen ger dig (mappat mot din kravlista)

- **Dagar till utgång** → IG (exakt), FB (exakt om app-creds finns, annars giltig/ogiltig), YouTube (giltig/ogiltig — modellen har ingen dagräkning).
- **Senaste lyckade refresh** → `last_refreshed_at` (IG), `last_verified_at` (alla).
- **Status i Operations Center** → ny Integrationer-panel + Atlas-svar.
- **Notifiering innan utgång** → upptrappande mail på 14/7/3/0 dagar, deduperat.

---

## 6. Öppna beslut innan implementation

1. **Facebook exakt utgång:** är `META_APP_ID` + `META_APP_SECRET` satta i Vercel? Om ja → vi får riktig FB-utgång via `debug_token`. Om nej → FB visas som "giltig/ogiltig" utan dagräkning (eller så lägger du till app-creds).
2. **IG-refresh-frekvens:** vill du att jag ökar från månadsvis till veckovis (rekommenderas)?
3. **Notifieringskanal:** mail (som idag) räcker, eller vill du även ha det som en åtgärd i Action Center?
4. **Cadence på health-checken:** dagligen 06:15 UTC ok?

När du godkänt designen (och svarat på #1–#4) implementerar jag: migration → health-cron → Operations-panel → Atlas-kontext, och verifierar mot de faktiska tokens.
