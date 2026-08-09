import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

export function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex')
}

export function sha256File(path: string): string {
  return sha256(readFileSync(path))
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(sortValue(value), null, 2)}\n`
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, sortValue(child)]),
    )
  }
  return value
}
