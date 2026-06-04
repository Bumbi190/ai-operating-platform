/**
 * Familje-Stunden — Marketing Canon (maskinläsbar projektion av kunskapsbasen).
 *
 * Detta är en TROGEN projektion av den mänskliga sanningskällan i
 *   content/familje-stunden/themes/index.json   (12 teman)
 *   content/familje-stunden/marketing-bible.md   (value prop, pelare, vinklar, CTA)
 *   content/familje-stunden/themes/<tema>.md      (must_not / "vad som inte hör hemma")
 *
 * Den ligger i koden (inte runtime-fs) eftersom content/ är utanför apps/web och
 * inte buntas pålitligt i serverless. INGET hittas på här — endast kanon kopieras,
 * och canon-nivåer ([KANON]/[OSÄKER]/[LUCKA]) bevaras. Uppdatera vid KB-ändring.
 *
 * ⛔ The Prompt / AI News berörs aldrig.
 */
import type { MarketingChannel, MarketingFormat, MarketingBeat } from '@/lib/supabase/types'

export type CanonLevel = 'KANON' | 'OSAKER' | 'LUCKA'

// ─── Varumärkesfakta [KANON — webbplats/Marketing Bible] ─────────────────────
export const BRAND = {
  handle: '@familjestunden',
  color: '#F652A0',
  age: '3–7 år',
  tagline: 'Magiska lärstunder hemma',
  tone: 'varm, trygg, magisk, svensk',
} as const

// ─── Marketing Bible-konstanter ──────────────────────────────────────────────
export const CORE_MESSAGE =
  'Magisk, skärmfri kvalitetstid varje månad — färdigt att använda direkt' // [KANON]

export const EMOTIONAL_PILLARS = [
  'Skärmfri kvalitetstid & närhet',
  'Enkelhet utan stress',
  'Trygghet',
  'Magi & fantasi',
  'Lärande genom lek',
  'Ritual & förväntan',
  'Meningsfullhet för föräldern',
] as const // [KANON]

export const PROOF_POINTS = [
  'ingen förberedelse krävs',
  'ljudsaga + diplom ingår',
  '59 kr + provmånad gratis',
] as const // [KANON]

export const APPROVED_ANGLE_TAGS = [
  'skärmfri kvalitetstid',
  'ingen planering krävs',
  'kvällsrutin/ritual',
  'lärande genom lek',
  'trygga återkommande figurer',
  'säsong/tema',
  'prisvärt + provmånad',
  'present (box)',
  'mysig magisk vardag',
] as const // [KANON]

/** Förbjudna vinklar — seedas som must_not i varje brief. [KANON/OSÄKER] (Marketing Bible §8) */
export const FORBIDDEN_ANGLE_TAGS = [
  'The Prompt / AI News / andra projekt',
  'skrämmande/olämpligt barninnehåll',
  'nya/ändrade karaktärer',
  'ogrundade utvecklings-/inlärningslöften',
  'skärmtids-skambudskap mot föräldrar',
  'överdrift mot vad paketet levererar',
] as const

export const CTA = {
  primary: 'Prova gratis',
  secondary: ['Starta prenumeration', 'Ge bort som present', 'Följ @familjestunden'],
} as const // [KANON — Marketing Bible §9]

/** Karaktärsroller [KANON — Character Bible v2 / Engine-design §5] */
export const CHARACTER_ROLES = {
  nova: 'nyfiken/kännande – känslohook',
  pling: 'lekfull/förklarande – wow & vad som ingår',
} as const

// ─── Beat-mönster & kalendermall [KANON beat-båge; OSÄKER kadens] ────────────
export type CtaType = 'trial' | 'subscribe' | 'follow' | 'gift'

export interface BeatChannelSpec {
  beat: MarketingBeat
  channel: MarketingChannel
  format: MarketingFormat
  objective: string
  ctaType: CtaType
  ctaLabel: string
}

/** v1-kadens: 4 beats × 2 kanaler = 8 poster (design §6/§8). */
export const CALENDAR_TEMPLATE: BeatChannelSpec[] = [
  { beat: 'teaser', channel: 'instagram', format: 'reel',     objective: 'awareness',        ctaType: 'follow',    ctaLabel: 'Följ @familjestunden' },
  { beat: 'teaser', channel: 'facebook',  format: 'fb_post',  objective: 'awareness',        ctaType: 'follow',    ctaLabel: 'Följ @familjestunden' },
  { beat: 'launch', channel: 'instagram', format: 'carousel', objective: 'awareness+trial',  ctaType: 'trial',     ctaLabel: 'Prova gratis' },
  { beat: 'launch', channel: 'facebook',  format: 'fb_post',  objective: 'awareness+trial',  ctaType: 'trial',     ctaLabel: 'Prova gratis' },
  { beat: 'mid',    channel: 'instagram', format: 'story',    objective: 'engagement',       ctaType: 'subscribe', ctaLabel: 'Starta prenumeration' },
  { beat: 'mid',    channel: 'facebook',  format: 'fb_post',  objective: 'engagement',       ctaType: 'subscribe', ctaLabel: 'Starta prenumeration' },
  { beat: 'bridge', channel: 'instagram', format: 'reel',     objective: 'retention',        ctaType: 'trial',     ctaLabel: 'Prova gratis' },
  { beat: 'bridge', channel: 'facebook',  format: 'fb_post',  objective: 'retention',        ctaType: 'follow',    ctaLabel: 'Följ @familjestunden' },
]

// ─── Teman (projektion av themes/index.json + Marketing Bible §10) ───────────
export interface ThemeCanon {
  monthIndex: number            // 1–12
  monthSv: string               // "september"
  themeKey: string              // slug = theme-bible-filnamn
  name: string                  // "Skördemånaden"
  emoji: string
  focus: string                 // [KANON] ur themes/index.json
  symbols: string[]             // [KANON]
  keyVisualPath: string | null  // storage_path (covers/<månad>.png)
  hasSaga: boolean              // saga-PDF finns (text ej analyserad → LUCKA)
  hasAudio: boolean
  defined: boolean              // false ⇒ tema ej fastställt (LUCKA)
  contentGap: boolean           // true ⇒ paketinnehåll ofullständigt i KB (LUCKA)
  primaryAngle: string          // [OSÄKER — Marketing Bible §10]
  emotionalPillar: string       // [OSÄKER — mappning]
  mustNot: string[]             // [KANON/OSÄKER] temats "vad som inte hör hemma"
}

const GENERIC_MUST_NOT = ['andra månaders ämnen']

export const THEMES: ThemeCanon[] = [
  { monthIndex: 1, monthSv: 'januari', themeKey: 'vinterexpedition', name: 'Vinterexpedition', emoji: '❄️',
    focus: 'Snöflingor, is, vinterdjur, vinterstjärnbilder.', symbols: ['snöflingor', 'is', 'vinterdjur', 'stjärnbilder'],
    keyVisualPath: 'covers/januari.png', hasSaga: false, hasAudio: false, defined: true, contentGap: true,
    primaryAngle: 'Mysig vinterstund inomhus; stjärnor & snöflingor', emotionalPillar: 'Närhet + Magi & fantasi', mustNot: GENERIC_MUST_NOT },
  { monthIndex: 2, monthSv: 'februari', themeKey: 'karleksmanad', name: 'Kärleksmånad', emoji: '❤️',
    focus: 'Känslor och vänskap; hjärtpyssel.', symbols: ['hjärtan', 'känslokort', 'vänskap'],
    keyVisualPath: 'covers/februari.png', hasSaga: true, hasAudio: false, defined: true, contentGap: false,
    primaryAngle: 'Känslor & vänskap (känslokort) — alla hjärtans-säsong', emotionalPillar: 'Trygghet + Närhet', mustNot: GENERIC_MUST_NOT },
  { monthIndex: 3, monthSv: 'mars', themeKey: 'varens-forsta-steg', name: 'Vårens första steg', emoji: '🌱',
    focus: 'Knoppar, fåglar, vårtecken; plantera frön.', symbols: ['knoppar', 'fåglar', 'frön', 'vårtecken'],
    keyVisualPath: 'covers/mars.png', hasSaga: false, hasAudio: false, defined: true, contentGap: true,
    primaryAngle: 'Naturen vaknar; plantera tillsammans', emotionalPillar: 'Lärande genom lek + Magi & fantasi', mustNot: GENERIC_MUST_NOT },
  { monthIndex: 4, monthSv: 'april', themeKey: 'experimentmanad', name: 'Experimentmånad', emoji: '🧪',
    focus: 'Vattnets former, väderstation, naturvetenskap.', symbols: ['vatten', 'väder', 'experiment'],
    keyVisualPath: 'covers/april.png', hasSaga: false, hasAudio: false, defined: true, contentGap: true,
    primaryAngle: 'Lekfull vetenskap hemma; wow-stunder', emotionalPillar: 'Lärande genom lek + Magi & fantasi', mustNot: ['osäkra experiment utan vuxen', ...GENERIC_MUST_NOT] },
  { monthIndex: 5, monthSv: 'maj', themeKey: 'blomsteraventyr', name: 'Blomsteräventyr', emoji: '🌸',
    focus: 'Fjärilar, bin, blommor; pressade blommor.', symbols: ['fjärilar', 'bin', 'blommor'],
    keyVisualPath: 'covers/maj.png', hasSaga: false, hasAudio: false, defined: true, contentGap: true,
    primaryAngle: 'Fjärilar & blommor; vår/utomhus', emotionalPillar: 'Magi & fantasi + Närhet', mustNot: GENERIC_MUST_NOT },
  { monthIndex: 6, monthSv: 'juni', themeKey: 'juni-ej-faststallt', name: '(tema ej fastställt)', emoji: '',
    focus: 'Att bekräfta — nyckelbild finns.', symbols: [],
    keyVisualPath: 'covers/juni.png', hasSaga: false, hasAudio: false, defined: false, contentGap: true,
    primaryAngle: '', emotionalPillar: '', mustNot: GENERIC_MUST_NOT },
  { monthIndex: 7, monthSv: 'juli', themeKey: 'sagosommar', name: 'Sagosommar', emoji: '📖',
    focus: 'Sagor från olika kulturer; skapa egna berättelser.', symbols: ['sagor', 'berättelser', 'sommar'],
    keyVisualPath: 'covers/juli.png', hasSaga: true, hasAudio: false, defined: true, contentGap: false,
    primaryAngle: 'Sommar/strand; skapa egna sagor (semester)', emotionalPillar: 'Magi & fantasi + Närhet', mustNot: GENERIC_MUST_NOT },
  { monthIndex: 8, monthSv: 'augusti', themeKey: 'skolstart-bokstavsaventyr', name: 'Skolstart & Bokstavsäventyr', emoji: '🤓',
    focus: 'Bokstavsjakt, siffer-memory, skoltema.', symbols: ['bokstäver', 'siffror', 'skola'],
    keyVisualPath: 'covers/augusti.png', hasSaga: true, hasAudio: false, defined: true, contentGap: false,
    primaryAngle: 'Trygg skolstart; bokstäver & siffror', emotionalPillar: 'Trygghet + Lärande genom lek', mustNot: GENERIC_MUST_NOT },
  { monthIndex: 9, monthSv: 'september', themeKey: 'skordemanaden', name: 'Skördemånaden', emoji: '🍂',
    focus: 'Äpplen, svampar, pumpor; skördefest.', symbols: ['äpplen', 'svampar', 'pumpor', 'skörd'],
    keyVisualPath: 'covers/september.png', hasSaga: true, hasAudio: false, defined: true, contentGap: false,
    primaryAngle: 'Mysig höstskörd tillsammans — smaker, svamp och pumpor', emotionalPillar: 'Skärmfri kvalitetstid & närhet + Ritual & förväntan',
    mustNot: ['uppmana smaka okända/giftiga svampar utan vuxen', ...GENERIC_MUST_NOT] },
  { monthIndex: 10, monthSv: 'oktober', themeKey: 'lov-och-skuggmanaden', name: 'Löv- & skuggmånaden', emoji: '🍁',
    focus: 'Ljus, löv, skuggteater, höstlykta.', symbols: ['löv', 'skuggor', 'ljus', 'höstlykta'],
    keyVisualPath: 'covers/oktober.png', hasSaga: false, hasAudio: false, defined: true, contentGap: true,
    primaryAngle: 'Mysig höst; skuggteater, höstlykta', emotionalPillar: 'Närhet + Magi & fantasi', mustNot: GENERIC_MUST_NOT },
  { monthIndex: 11, monthSv: 'november', themeKey: 'rymdmanaden', name: 'Rymdmånaden', emoji: '🚀',
    focus: 'Planeter, stjärnor, galaxer; rymdpyssel.', symbols: ['planeter', 'stjärnor', 'galaxer', 'Stjärnstenen'],
    keyVisualPath: 'covers/november.png', hasSaga: true, hasAudio: true, defined: true, contentGap: false,
    primaryAngle: 'Rymdäventyr med Nova & Pling; Stjärnstenen', emotionalPillar: 'Magi & fantasi + Lärande genom lek', mustNot: GENERIC_MUST_NOT },
  { monthIndex: 12, monthSv: 'december', themeKey: 'julmanaden', name: 'Julmånaden', emoji: '🎄',
    focus: 'Galaktisk jul; tomtar, snö, traditioner.', symbols: ['jul', 'tomtar', 'snö', 'traditioner'],
    keyVisualPath: 'covers/december.png', hasSaga: false, hasAudio: false, defined: true, contentGap: true,
    primaryAngle: 'Magisk jul; tradition & värme', emotionalPillar: 'Ritual & förväntan + Närhet', mustNot: GENERIC_MUST_NOT },
]

export function themeByMonthIndex(monthIndex: number): ThemeCanon | undefined {
  return THEMES.find((t) => t.monthIndex === monthIndex)
}

export function nextTheme(monthIndex: number): ThemeCanon | undefined {
  return themeByMonthIndex(monthIndex === 12 ? 1 : monthIndex + 1)
}

/**
 * EVERGREEN — varumärkesmarknadsföring för månader UTAN fastställt säsongstema
 * (t.ex. juni, vars Theme Bible-tema är [LUCKA]). Inget säsongstema hittas på:
 * detta är ren value prop + Nova & Pling + provmånad ur Marketing Bible/Brand Rules.
 * symbols=[] ⇒ inga säsongssymboler krävs/valideras.
 */
export const EVERGREEN_THEME: ThemeCanon = {
  monthIndex: 0,
  monthSv: 'evergreen',
  themeKey: 'familje-evergreen',
  name: 'Familje-Stunden (varumärke)',
  emoji: '✨',
  focus: 'Varumärkesmarknadsföring utan säsongstema — skärmfri kvalitetstid, Nova & Pling, provmånad.',
  symbols: [],
  keyVisualPath: 'covers/juni.png',
  hasSaga: false,
  hasAudio: false,
  defined: true,
  contentGap: false,
  primaryAngle: 'Skärmfria mysstunder med Nova & Pling — färdigt att använda direkt',
  emotionalPillar: 'Skärmfri kvalitetstid & närhet + Enkelhet utan stress',
  mustNot: GENERIC_MUST_NOT,
}

/** Slå upp ett tema från säsongscykeln ELLER evergreen-varumärkesprofilen. */
export function resolveTheme(themeKey: string | null | undefined): ThemeCanon | undefined {
  if (!themeKey) return undefined
  if (themeKey === EVERGREEN_THEME.themeKey) return EVERGREEN_THEME
  return THEMES.find((t) => t.themeKey === themeKey)
}
