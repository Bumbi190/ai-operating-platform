/**
 * Operator-only evaluator for source-ID ranking receipts.
 *
 * No service, model, user account, publishing or vault connection. It reads
 * one explicitly supplied local JSON file and prints ONLY aggregate metrics.
 * The historical fixture is intentionally a no-go; --report-only lets an
 * operator inspect that failure without making the CI job red.
 *
 * Usage from apps/web:
 * npx tsx scripts/openviking-quality-evaluate.ts --input=lib/qa/fixtures/atlas-openviking-five-source-history.json --report-only
 * npx tsx scripts/openviking-quality-evaluate.ts --input=path/to/private-held-out-receipt.json
 */
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { evaluateOpenVikingQuality } from '../lib/atlas/openviking/quality-evaluation'

const args = process.argv.slice(2)
const fileArg = args.find(arg => arg.startsWith('--input='))?.slice('--input='.length)
const reportOnly = args.includes('--report-only')
if (!fileArg || args.some(arg => !arg.startsWith('--input=') && arg !== '--report-only')) {
  console.error('Usage: --input=<local-receipt.json> [--report-only]')
  process.exitCode = 2
} else {
  try {
    const filename = resolve(process.cwd(), fileArg)
    if (!statSync(filename).isFile() || statSync(filename).size > 1_000_000) {
      throw new Error('unsupported file size')
    }
    const input = JSON.parse(readFileSync(filename, 'utf8'))
    const result = evaluateOpenVikingQuality(input)
    // Never include source contents, individual questions, token-like metadata,
    // rank paths or a private absolute filename in this output.
    console.log(JSON.stringify(result, null, 2))
    if (!reportOnly && !result.qualityEligibleForManualReview) process.exitCode = 2
  } catch {
    // No raw fs/JSON error; error messages may include private absolute paths.
    console.error('OpenViking evaluation could not validate the supplied local receipt')
    process.exitCode = 2
  }
}
