/** Explicit upload; --apply is mandatory. No secret or document body is printed. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseCorpus } from '../lib/atlas/openviking/corpus'
import { readClientConfig } from '../lib/atlas/openviking/client'
import { synchronizeCorpus } from '../lib/atlas/openviking/publish'

function option(name: string) {
  return process.argv.slice(2).find((arg) => arg.startsWith('--' + name + '='))?.slice(name.length + 3)
}
async function main() {
  if (!process.argv.includes('--apply')) throw new Error('Explicit apply required')
  const config = readClientConfig()
  const artifact = JSON.parse(readFileSync(resolve(option('corpus') ?? 'data/openviking/corpus.json'), 'utf8'))
  const corpus = parseCorpus(artifact)
  const previousPath = option('prune-previous')
  const previous = previousPath ? parseCorpus(JSON.parse(readFileSync(resolve(previousPath), 'utf8'))) : undefined
  if (!config || !corpus || (previousPath && !previous)) throw new Error('Invalid configuration')
  const receipt = await synchronizeCorpus({
    config: { ...config, timeoutMs: 30_000 }, corpus, previous: previous ?? undefined,
    processingMode: process.argv.includes('--vectors-only') ? 'vectors_only' : 'semantic_and_vectors',
  })
  console.log(JSON.stringify(receipt))
}
main().catch(() => {
  console.error('OpenViking synchronization failed. No readiness receipt was issued.')
  process.exitCode = 1
})
