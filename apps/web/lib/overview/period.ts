import type { OverviewPeriod } from './types'
const dayFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Stockholm',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
})
const clockFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Stockholm',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
})
export function stockholmDay(date: Date): string {
  return dayFormat.format(date)
}
function shiftDay(key: string, days: number): string {
  return new Date(Date.parse(key + 'T12:00:00Z') + days * 86400000)
    .toISOString()
    .slice(0, 10)
}
function midnight(key: string): string {
  const target = Date.parse(key + 'T00:00:00Z')
  let guess = target
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(
      clockFormat.formatToParts(new Date(guess)).map((p) => [p.type, p.value])
    )
    const local = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour),
      Number(p.minute),
      Number(p.second)
    )
    const next = target - (local - guess)
    if (next === guess) break
    guess = next
  }
  return new Date(guess).toISOString()
}
export function stockholmPeriod(
  days: OverviewPeriod,
  now: Date
): { startIso: string; endIso: string; dayKeys: string[] } {
  const today = stockholmDay(now),
    first = shiftDay(today, 1 - days)
  return {
    startIso: midnight(first),
    endIso: midnight(shiftDay(today, 1)),
    dayKeys: Array.from({ length: days }, (_, i) => shiftDay(first, i))
  }
}
