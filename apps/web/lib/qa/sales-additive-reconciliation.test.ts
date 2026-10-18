import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('source reconciliation of already-applied parallel sales migrations', () => {
  it.each([
    ['20261017141000_sales_managed_host.sql', 'a258d7fc159632564747c9a49c5b48037c8c75726b26859892301127dfbf832a'],
    ['20261017142000_sales_strato_connection.sql', '2e3301eb992694901c15904899c586093632dfb2acf91db2474c8447c6243b1e'],
    ['20261018040242_sales_reply_preparation.sql', '7516d8566ae7776086452ff8fdd51058ce34a10ab70973bcdbf4ee14f655a3cc'],
  ])('retains exact already-applied source for %s', (file, digest) => {
    const path = resolve(process.cwd(), 'supabase/migrations', file)
    expect(existsSync(path)).toBe(true)
    const sql = readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
    expect(createHash('sha256').update(sql).digest('hex')).toBe(digest)
  })
})
