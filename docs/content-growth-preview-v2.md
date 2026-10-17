# Content Growth Lab v2 — två 12-sekunders test-Reels

Två isolerade och redaktionellt säkra Remotion-kompositioner för att bedöma faktiska öppningar innan publicering. De är UTKAST utan röst, godkänd publiceringskoppling eller plattformsstatistik.

Kompositioner: FamiljeStundenContentLab och ThePromptContentLab, 1080×1920, 30 fps, 360 frames.

Familje-Stunden använder kärnbudskapen från content/familje-stunden/marketing-bible.md och frivilliga godkända Nova/Pling-bilder via imageUrls. The Prompt använder endast sin egen branding. Inga påståenden om verkliga nyheter, visningar eller resultat.

Rendera lokalt från apps/remotion med npx remotion render src/index.ts FamiljeStundenContentLab family-test.mp4 --codec=h264 (respektive ThePromptContentLab). För familjen kan två originalbilder kopieras till en lokal test-public-katalog och anges via --props JSON. Lägg inte kopior av bilderna i Omnira-repositoryt utan särskild assetpolicy.

QA: kontrollera frames 0,15,30,60,90, läsbarhet, rörelse, brandisolering och bildrättigheter. Komplettera därefter med redan godkänd röst, riktig källa, ljudsynkronisering och manuell publiceringsgrind. Detta är ett kreativt laboratorium, inte en färdig auto-postande pipeline.

Ingen ny DB, OAuth, API-kostnad, schemaläggning, automatiska DM eller ändring av befintliga ShortFormVideo/SimpleNewsReel.
