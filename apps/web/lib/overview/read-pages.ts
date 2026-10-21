import type { ReadResult } from './types'
/** Bounded reads never present a capped or unstable page set as a complete total. */
export async function readOverviewPages<T>(
  query: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<ReadResult<T>> {
  const rows: T[] = [],
    seen = new Set<string>()
  for (let page = 0; page < 40; page++) {
    let result: { data: T[] | null; error: unknown }
    try {
      result = await query(page * 500, page * 500 + 499)
    } catch {
      return { state: rows.length ? 'partial' : 'unavailable', rows }
    }
    if (result.error || !Array.isArray(result.data))
      return { state: rows.length ? 'partial' : 'unavailable', rows }
    for (const row of result.data) {
      const id = (row as { id?: unknown } | null)?.id
      if (typeof id !== 'string' || !id || seen.has(id))
        return { state: 'partial', rows }
      seen.add(id)
      rows.push(row)
    }
    if (result.data.length < 500) return { state: 'complete', rows }
  }
  return { state: 'partial', rows }
}
