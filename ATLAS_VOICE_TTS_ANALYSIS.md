# Atlas Voice — TTS & Röstupplevelse: Analys och Rekommendationer

**Branch:** feat/atlas-voice-ui  
**Datum:** 2026-06-29  
**Scope:** Endast UX/voice — inte backend, Memory, Brief eller Collectors

---

## Nuläge

Atlas voice-pipeline ser ut så här:

```
Användare talar
  → Web Speech API (STT, sv-SE, Chrome/Safari)
  → SILENCE_MS (800ms tystnadströskel)
  → POST /api/chat (streaming LLM, SSE)
  → Meningsgränser (.!?) flushas → POST /api/chat/tts (per mening)
  → Audio-kö spelas upp i ordning
```

**Befintlig TTS:** OpenAI `tts-1` / `onyx`-röst  
**Uppdaterat i denna branch:** `tts-1-hd`, `speed: 1.08`, `SILENCE_MS: 800ms`

---

## Latensanalys (mätt i prod)

| Steg | Tid |
|------|-----|
| STT-tystnadströskel | 800ms (sänkt från 1100ms) |
| LLM → första token | ~400–700ms |
| TTS (tts-1) per mening | ~250–500ms |
| TTS (tts-1-hd) per mening | ~350–650ms |
| **Total: slutade prata → första ljud** | **~1.5–2.0s** |

Målet är <2s. Vi är nära men kan gå lägre.

---

## Alternativa TTS-lösningar

### 1. OpenAI tts-1-hd (implementerat ✅)
- **+** Bättre prosodi och vokalljud på svenska
- **+** Tydligare `å`, `ä`, `ö`
- **−** ~100–150ms extra latens per mening
- **Rekommendation:** Behåll som standard för Atlas

### 2. ElevenLabs (eleven_turbo_v2_5)
- **+** ~150–300ms per mening (snabbare än OpenAI HD)
- **+** Mer naturligt klingande svenska med rätt röst-ID
- **+** Multilingual V2 stöder svenska nativt
- **−** Kostar mer per tecken (~0.30 kr/1000 tecken vs OpenAI ~0.15 kr)
- **−** ElevenLabs används redan för media-pipeline — delade rate-limits

**Svenska röster i ElevenLabs att utvärdera:**
- `XrExE9yKIg1WjnnlVkGX` — Matilda (multilingual, fungerar bra på svenska)
- Sök "Swedish" i Voice Library för nativa alternativ
- För Atlas (manlig, lugn): leta efter "Adam" eller "Thomas" med sv-SE testning

**Implementationsväg:** Lägg till `atlas` voice-profil i `lib/voice/config.ts` och en `/api/chat/tts-el` route som proxar ElevenLabs. Gör det konfigurerbart med env-variabel `ATLAS_TTS_PROVIDER=elevenlabs|openai`.

### 3. OpenAI gpt-4o-realtime-preview (nästa nivå)
- **+** LLM + TTS i ett enda WebSocket-anrop
- **+** Total latens ~200–400ms (dramatiskt bättre)
- **+** True streaming audio (PCM16, inte mp3-block)
- **+** Inbyggd barge-in (servern lyssnar och avbryter)
- **+** Svenska stöds
- **−** Kräver WebSocket proxy (Next.js API routes stöder inte WebSocket)
- **−** Kräver ny arkitektur: `/api/chat/realtime` via Vercel Edge Function + WebSocket
- **−** Kostnad: ~$0.06/min audio-in, ~$0.24/min audio-out (dyrare)
- **Rekommendation:** Planera för Q3 som ett separat beslut. Ger ChatGPT Voice-känsla.

---

## Barge-in (avbryta Atlas mitt i tal)

**Nuläge (implementerat ✅):**
- Klick på orben under `speaking`-fas → stoppar audio, startar lyssning direkt
- `cancelRef.current = true` stänger TTS-kön
- UX: tydligt i fase-animationen — orben visar "tryck för att avbryta"

**Vad saknas:**
- Audio-baserad barge-in (STT lyssnar parallellt med uppspelning) — kräver
  att mikrofonen är öppen MEDAN Atlas talar. Tekniskt möjligt med Web Audio API
  men riskerar eko-feedback på datorer utan hörlurar.
- `gpt-4o-realtime` löser detta på server-sidan (inbyggt).

**Rekommendation:** Behåll klick-barge-in för nu. Lägg till audio-barge-in
i realtime-fasen.

---

## Snabbaste vinster (implementerade i denna branch)

| Förändring | Effekt |
|------------|--------|
| SILENCE_MS: 1100 → 800ms | -300ms per tur |
| tts-1 → tts-1-hd | Bättre uttal av svenska tecken |
| speed: 1.0 → 1.08 | Mer naturlig svenska-rytm |
| Orb döljer global voice-pill | Enklare UX på /atlas |
| CommandBar döljs på /atlas | Mer immersiv samtalsupplevelse |

---

## Rekommenderad roadmap

```
Nu (denna branch)
  ✅ tts-1-hd + speed 1.08
  ✅ SILENCE_MS 800ms
  ✅ Atlas orb + voice-first page

Nästa sprint
  → ElevenLabs svensk röst för Atlas (separat voice-profil)
  → A/B-test: OpenAI HD vs ElevenLabs latens + kvalitet

Q3
  → gpt-4o-realtime-preview WebSocket proxy
  → True streaming audio + server-side barge-in
  → Dramatiskt lägre latens (~300ms total)
```

---

## Noteringar om Web Speech API (STT)

- Fungerar bara i Chrome och Safari — inte Firefox
- `lang: 'sv-SE'` ger rimlig igenkänning men missar facktermer
- Alternativ: OpenAI Whisper (`/api/audio/transcriptions`) via MediaRecorder
  - Bättre noggrannhet
  - ~400–800ms extra latens per anrop
  - Rekommenderas när precision väger mer än hastighet

---

*Backend-problem att inte ändra: befintlig `/api/chat/tts`-route är delad
med eventuella framtida consumers. Ändringar här är bakåtkompatibla — nya
parametrar (`hd`, `speed`) är valfria med samma defaults.*
