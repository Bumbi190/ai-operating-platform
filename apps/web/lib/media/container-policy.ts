/**
 * container-policy.ts — beslutsregler för Instagram-containrar.
 *
 * Extraherad ur cron/publish/route.ts för att beslutet ska gå att testa rent,
 * utan Supabase- och Meta-mockar. Det här är den logik som fallerade i
 * incidenten 2026-07-19 och det är den logik som kan orsaka dubbelpublicering
 * om den blir fel — den förtjänar egna, uttömmande tester.
 *
 * Funktionen är ren: inga anrop, inga sidoeffekter, ingen tid som läses internt.
 */

import type { ContainerStatus } from './instagram'

export type ContainerAction =
  /** Containern går att publicera — återanvänd den. */
  | { action: 'reuse' }
  /** Containern är obrukbar (utgången, trasig, borta, för gammal) — skapa ny. */
  | { action: 'recreate'; reason: string }
  /**
   * Meta har REDAN publicerat containern. Publicera aldrig igen — försök i
   * stället återhämta media-id:t. Detta är skyddet mot dubbelpublicering när
   * ett tidigare svar gick förlorat.
   */
  | { action: 'recover'; reason: string }

/**
 * Meta håller en container i ~24h. Vi skapar hellre en ny i god tid än att
 * bränna en körning på en container som hinner löpa ut mitt i publiceringen.
 */
export const CONTAINER_MAX_AGE_H = 20

/**
 * Avgör vad som ska hända med ett sparat creation_id.
 *
 * VIKTIGT — ordningen är säkerhetskritisk: statusen från Meta utvärderas FÖRE
 * åldern. En container som är äldre än TTL men som Meta rapporterar som
 * PUBLISHED får ALDRIG leda till att en ny container skapas — då hade vi
 * publicerat samma video två gånger. Ålder är bara ett skäl att kassera en
 * container som ännu inte har publicerats.
 *
 * @param status  Metas status_code, eller 'UNKNOWN' om den inte kunde läsas.
 * @param ageH    Containerns ålder i timmar. Infinity = okänd (t.ex. rader från
 *                före migrationen som införde instagram_creation_id_at).
 */
export function decideContainerAction(status: ContainerStatus, ageH: number): ContainerAction {
  // 1. Publicerad — alltid återhämtning, oavsett ålder.
  if (status === 'PUBLISHED') {
    return { action: 'recover', reason: 'Meta rapporterar containern som PUBLISHED' }
  }

  // 2. Definitivt obrukbara tillstånd.
  if (status === 'EXPIRED')   return { action: 'recreate', reason: 'container EXPIRED' }
  if (status === 'ERROR')     return { action: 'recreate', reason: 'container i ERROR-state' }
  if (status === 'NOT_FOUND') return { action: 'recreate', reason: 'container okänd hos Meta' }

  // 3. Går inte att verifiera → lita inte på den.
  if (status === 'UNKNOWN')   return { action: 'recreate', reason: 'containerstatus kunde inte läsas' }

  // 4. Publicerbar status, men för gammal för att vara pålitlig.
  if (!Number.isFinite(ageH)) {
    return { action: 'recreate', reason: 'containerns ålder är okänd' }
  }
  if (ageH >= CONTAINER_MAX_AGE_H) {
    return { action: 'recreate', reason: `container ${ageH.toFixed(1)}h gammal (max ${CONTAINER_MAX_AGE_H}h)` }
  }

  // 5. FINISHED eller IN_PROGRESS och färsk → återanvänd.
  return { action: 'reuse' }
}

/** Ålder i timmar för en tidsstämpel, eller Infinity om den saknas. */
export function containerAgeHours(createdAt: string | null | undefined, now = Date.now()): number {
  if (!createdAt) return Infinity
  const t = new Date(createdAt).getTime()
  if (Number.isNaN(t)) return Infinity
  return (now - t) / 3_600_000
}
