import { createHash } from 'node:crypto'

/** Domain-separated SHA-256 used wherever evidence wants a hash instead of a local path. */
export function sha256Tagged(domain: string, value: string): string {
  return createHash('sha256').update(`omnira.sdf1c3.${domain}.v1\n${value}`).digest('hex')
}
