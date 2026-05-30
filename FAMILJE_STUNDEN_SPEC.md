# Familje-Stunden — Produkt-spec (KÄLLA: Andre, 2025-05-17)

## Månadspaket PDF (`/api/runs/[id]/monthly-pdf`)

Exakt 9 sidor i denna ordning:

1. **Omslagsbild** — genererad bild, titeln på månadstemats paket
2. **Innehållssida** — lista med vad som ingår i paketet
3. **Sagosidan med knappar** — info om sagan + knapp till Saga PDF + knapp till Ljudsaga
4. **5 Aktivitetssidor** — en sida per aktivitet, med illustration + instruktioner
5. **5 Färgläggningsbilder** — B&W-bilder för utskrift, en per sida
6. **Klipp & klistra / Pyssel** — en sida med pyssel-illustration + instruktioner
7. **Krysslista** — månadens aktiviteter att kryssa av
8. **Diplom** — ifyllbart diplom för barnet
9. **Avslutningssida** — uppmaning till nästa månads äventyr

## Saga PDF (`/api/runs/[id]/ebook?format=pdf`)

Separat fil, innehåller:

1. **Omslagsbild** — full-bleed illustration med sagans titel
2. **Max 16 sagasidor** — varje sida:
   - Full-bleed Pixar-illustration (unik per sida)
   - Kremfärgad textbox i botten
   - **MAX 1–2 meningar text** per sida (det som läses upp i MP3:n)
   - Sidnummer i rosa cirkel
3. **Baksida** — passande avslutningsbild med månadens lärdom

## Karaktärer

- **Nova** — glad 6-årig flicka, brunt hår i hästsvans, rosa pannband, blå pikétröja, rosa kjol, rosa skor
- **Pling** — liten söt blå robot, mörkt visir, blå glödande ögon, rosa antenn, gult hjärta på bröstet

## Saga-text-regler

- Saga-berättaren skriver MAX 1–2 meningar per sida i sagan (det som läses upp högt)
- MP3-MANUS är den fullständiga berättarrösten med pauser, ton och känsla
- Bilderna berättar resten — texten är bara dialogen/höjdpunkten

## Workflow-steg (8 steg)

1. Tema
2. Aktiviteter (5st + 1 pyssel)
3. Saga (16 sidor, kort text, + MP3-manus)
4. Komplement (krysslista + diplom + avslutning)
5. Bildprompts — 5 B&W färgläggningsprompts
6. Färgläggningsbilder — 5 B&W bilder (gpt-image-1)
7. Saga-bildprompts — 16 unika Pixar-prompts
8. Saga-illustrationer — 16 full-color portrait bilder (gpt-image-1)

## Viktigt

- Månads-PDF har INGA saga-illustrationer inbäddade — bara knappar till Saga PDF
- Saga PDF använder `sagabilder` (context key), inte `bilder`
- Aktivitetssidor i månads-PDF behöver egna illustrationer (framtida fas)
