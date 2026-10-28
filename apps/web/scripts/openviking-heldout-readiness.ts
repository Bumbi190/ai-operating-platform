/**
 * Operator-only, read-only audit of a PRIVATE, frozen held-out question plan.
 *
 * No publication, network, OpenViking request, source-body output, cron, M4,
 * Notion or Atlas runtime invocation. Inputs MUST be outside this public repo.
 * Printed output: only aggregate counts, reason codes and a lock digest.
 *
 * Example from apps/web:
 * node --import tsx scripts/openviking-heldout-readiness.ts \
 *   --private-root="C:/Users/.../Omnira/Local/OpenViking-Heldout" \
 *   --plan="C:/Users/.../Omnira/Local/OpenViking-Heldout/plan.json" \
 *   --corpus="C:/Users/.../Omnira/Local/OpenViking-Heldout/approved-corpus.json" \
 *   --report-only
 */
import { realpathSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCorpus } from '../lib/atlas/openviking/corpus'
import { checkHeldoutReadiness } from '../lib/atlas/openviking/heldout-readiness'

type Options = { privateRoot: string; plan: string; corpus: string; reportOnly: boolean }

function parseArgs(args: string[]): Options | null {
  const fields = new Map<string, string>()
  let reportOnly = false
  for (const item of args) {
    if (item === '--report-only') { reportOnly = true; continue }
    const found = /^--(private-root|plan|corpus)=(.+)$/.exec(item)
    if (!found || fields.has(found[1])) return null
    fields.set(found[1], found[2])
  }
  const privateRoot = fields.get('private-root')
  const plan = fields.get('plan')
  const corpus = fields.get('corpus')
  return privateRoot && plan && corpus
    ? { privateRoot, plan, corpus, reportOnly } : null
}

function inside(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel))
}

function loadJson(file: string, root: string, maxSize: number): unknown {
  if (!isAbsolute(file)) throw new Error('private input path must be absolute')
  const exact = realpathSync(file)
  if (!inside(root, exact)) throw new Error('file outside private root')
  const stat = statSync(exact)
  if (!stat.isFile() || stat.size <= 0 || stat.size > maxSize) {
    throw new Error('invalid private input size')
  }
  return JSON.parse(readFileSync(exact, 'utf8'))
}

/**
 * In normal mode, a blocked plan exits 2; a complete, locked plan exits 0.
 * --report-only permits an INCOMPLETE plan to exit 0 for local diagnosis,
 * but never grants runtime access or executes retrieval.
 * This program never launches retrieval or writes an output document.
 */
const options = parseArgs(process.argv.slice(2))
if (!options) {
  console.error('Required: --private-root=<absolute> --plan=<absolute> --corpus=<absolute> [--report-only]')
  process.exitCode = 2
} else {
  try {
    if (!isAbsolute(options.privateRoot)) throw new Error('invalid private root')
    const privateRoot = realpathSync(options.privateRoot)
    if (!statSync(privateRoot).isDirectory()) throw new Error('private root not a directory')
    // Source-relative repository root: NOT dependent on the caller's cwd.
    // Otherwise running this CLI from another folder could accidentally
    // read private question text from inside a public Git checkout.
    const repositoryRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../..'))
    // A question plan committed under the public repository is a privacy
    // incident, even if its content currently looks innocuous.
    if (inside(repositoryRoot, privateRoot) || inside(privateRoot, repositoryRoot)) {
      throw new Error('private root may not overlap the public checkout')
    }
    const rawPlan = loadJson(options.plan, privateRoot, 512_000)
    const rawCorpus = loadJson(options.corpus, privateRoot, 2_500_000)
    const validatedCorpus = parseCorpus(rawCorpus)
    const result = checkHeldoutReadiness(rawPlan, validatedCorpus)
    // Never log raw error objects, file paths, source titles or questions.
    console.log(JSON.stringify(result, null, 2))
    if (!options.reportOnly && !result.readyForOperatorCaptureReview) process.exitCode = 2
  } catch {
    console.log(JSON.stringify({
      readyForOperatorCaptureReview: false,
      runtimeActivationAuthorized: false,
      expectedDigest: null,
      reasonCodes: ['private_inputs_missing_or_unsafe'],
      counts: {
        sourceDocuments: 0, answerable: 0, unsupported: 0,
        foreignProject: 0, duplicateQuestions: 0, invalidQuestions: 0,
      },
    }))
    process.exitCode = 2
  }
}
