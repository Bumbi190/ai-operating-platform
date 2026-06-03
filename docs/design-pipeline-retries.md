# Design: Retry + notifieringar för step1, step2, step3 (punkt 2)

**Status:** Design för godkännande. Ingen implementation ännu.
**Mål:** inget innehåll ska kunna utebli *tyst* p.g.a. ett temporärt fel hos Claude, ElevenLabs, Ideogram eller Remotion. Antingen lyckas det automatiskt via retry, eller så syns det tydligt (Operations Center + Action Center + mail).

---

## Nuvarande felhantering (fakta)

| Steg | Extern tjänst | Vid fel idag | Retry idag | Larm idag | Lämnar spår? |
|------|---------------|--------------|-----------|-----------|--------------|
| **step1** Generate Script | Claude + Hermes (news) | `hunt_failed` → HTTP 500, **inget script skapas** | **Ingen** | **Nej** | Nej — ingen rad finns att återuppta |
| **step2** Voiceover + bilder | ElevenLabs + Ideogram | `voice_status='none'` återställs → HTTP 500 | Implicit (nästa cron) | **Nej** | Ja (scriptraden) |
| **step3** Bilder + render-start | Ideogram + Remotion Lambda | `video_status='none'` återställs → HTTP 500 | Implicit (nästa cron) + `reset_stuck_scripts` var 5:e min | **Nej** | Ja (scriptraden) |

**Befintligt skydd:** `omnira_reset_stuck_images` (var 5:e min) återställer script som fastnat i `generating_images` >8 min → `none`. Det räddar *krasch mitt i*, men larmar inte och hanterar bara step3-bilder.

---

## Nuvarande retry-beteende — och varför det inte räcker

Den "implicita retryn" (nästa cron plockar upp scripts med `voice_status=none`/`video_status=none`) är **bräcklig p.g.a. ett 60-minuters urvalsfönster**:

```
step2/step3 väljer: ... .gte('generated_at', now - 60 min)
```

- Om step2 fallerar och **mer än 60 minuter** passerar innan nästa körning (cronen kör bara 2 ggr/dag, 07:25 + 17:25) → scriptet är för gammalt → **plockas aldrig upp igen**. Innehållet är tyst förlorat.
- En enda transient hicka (ElevenLabs 503, Ideogram timeout, Claude 429) släcker hela dagens video.
- step1 skapar ingen rad vid fel → det finns inget att återuppta alls.
- Ingen av dessa skickar larm → operatören vet inte att något uteblev.

**Det här är exakt "tyst bortfall"-risken du vill eliminera.**

---

## Risker (sammanfattat)

1. **Tyst innehållsbortfall** vid transienta API-fel (störst — målet att eliminera).
2. **60-min-fönstret** gör att misslyckade steg åldras ut innan nästa försök.
3. **12h mellan cron-körningar** = lång återhämtning även när retry "borde" ske.
4. **step1 utan spår** → ingen återupptagning möjlig.
5. **Noll observability/larm** på step1–3.

---

## Rekommenderad design — två lager

### Lager A — Retry *inom* anropet (transient resiliens)
Linda varje externt anrop i en bounded backoff: **3 försök, exponentiellt 1s/3s/9s + jitter**, men bara på transienta fel (HTTP 429/5xx, nätverk/timeout) — aldrig på permanenta (4xx, ogiltig input).
- Claude (script), ElevenLabs (voice), Ideogram (bilder), Lambda (render-start).
- Snabba anrop (Claude/Lambda-start) klarar 3 försök inom 60s-budgeten; tunga (voice/bilder) håller vi till 2 försök för att rymmas.
- Fångar den vanligaste orsaken (en enstaka blip) direkt — samma körning, inget åldrande.

### Lager B — Durabel steg-retry *mellan* körningar (inget åldras ut)
Ersätt det bräckliga "60-min-fönster + none-flagga" med explicit retry-tillstånd — **samma mönster som vi byggde för durable runs** (attempts + backoff + claim), applicerat på pipeline-stegen:

- Per steg på `media_scripts`: `voice_attempts`, `render_attempts` (+ `script`-spåret hanteras separat, se nedan), `pipeline_failed_step`, `pipeline_failed_reason`, `next_retry_at`.
- Vid fel: sätt steget till `failed` + öka attempts + sätt `next_retry_at` (backoff) — **i stället för** att återställa till `none` och åldras ut.
- Ny **pipeline-retry-drainer** (var 5:e min, generaliserar `reset_stuck_scripts`): plocka scripts vars steg är `failed`, `next_retry_at` passerat och `attempts < max (3)` → kör om rätt steg. Tar bort både 60-min-fönstret och 12h-gapet.
- Vid `attempts >= max`: markera `error` + **larm + Action Center** (operatörsgranskning). Innehållet förloras aldrig tyst — det retrias eller ytas.

**step1 (ingen rad vid fel)** behöver ett eget skyddsnät: en daglig **"producerades innehåll idag?"-vakt** — om noll scripts genererats i förväntat fönster, kör om step1 (med Lager A-retry) och larma om det fortsatt misslyckas. Det fångar Claude/Hermes-fel som annars inte lämnar spår.

---

## Notifieringar

Återanvänd `sendPipelineAlert` (mail) + samma Action Center-mönster som token-larmen:

| Händelse | Kanal | Allvar |
|----------|-------|--------|
| Steg fallerar (försök kvar) | Mail (severity warning) | info — retry pågår |
| Steg når max försök | Mail + **Action Center (urgent)** | kräver åtgärd |
| step1 producerade inget innehåll idag | Mail + Action Center | urgent |

Deduperat (ett mail per steg/script per eskaleringsnivå), precis som token-larmen.

---

## Påverkan på Operations Center

Utöka "The Prompt"-sektionen (bygger på `getOperations`):
- Nya mätare: **Retrying** (steg som väntar på omförsök) och **Fastnade/fel** (max-attempts nådda).
- "Misslyckade 24h" finns redan — vi skiljer nu på *retrying* (självläker) vs *error* (kräver dig).
- Varje script i `error` listas med steg + orsak, så du ser exakt var och varför.

## Påverkan på Atlas

`operationsSummary` får en pipeline-hälsorad → Atlas kan svara:
- *"Fastnar något i pipelinen?"* · *"Varför uteblev dagens video?"* · *"Vad väntar på omförsök?"*
Allt från samma sanningskälla, ingen ny fråga per tur.

---

## Vad designen ger (mot ditt mål)

Ett transient fel hos Claude/ElevenLabs/Ideogram/Remotion → **(1)** retrias direkt i anropet, annars **(2)** retrias av drainern inom minuter (inte 12h, åldras aldrig ut), och om det ändå inte går **(3)** ytas det i Operations Center + Action Center + mail. **Inget tyst bortfall kvar.**

---

## Öppna beslut innan implementation

1. **Max försök per steg** innan eskalering till operatör — förslag **3**. OK?
2. **Backoff-schema** — in-call 1s/3s/9s; drainer var 5:e min med `next_retry_at`-backoff (5m/15m/45m). OK?
3. **Schemautökning** på `media_scripts` (attempts/next_retry_at/failed_step/reason) — OK? (Litet, additivt, bakåtkompatibelt.)
4. **step1 "inget innehåll idag"-vakt** — vill du ha auto-omkörning av step1, eller bara larm så du själv triggar?
5. Ska den nya **pipeline-retry-drainern** ersätta `omnira_reset_stuck_images` (generalisera den) eller ligga bredvid?
