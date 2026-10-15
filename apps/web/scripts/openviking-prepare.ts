/**
 * Explicit operator action. Requires a clean Git-pinned vault.
 * Never edits notes or changes approval/classification metadata.
 */
import { readFileSync, writeFileSync, renameSync, mkdirSync, realpathSync, existsSync } from 'node:fs'
import { resolve, dirname, relative, isAbsolute } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createKnowledgeProjectionSource } from '../lib/atlas/knowledge/projection/source'
import { prepareCorpus } from '../lib/atlas/openviking/publish'

function option(name: string) {
  return process.argv.slice(2).find((arg) => arg.startsWith('--' + name + '='))?.slice(name.length + 3)
}
function inside(root: string, target: string) {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}
try {
  const vaultArg = option('vault')
  const mapArg = option('project-map')
  const projectSlug = option('project')
  if (!vaultArg || !mapArg || !projectSlug) throw new Error('Missing explicit configuration')
  const vaultRoot = realpathSync(resolve(vaultArg))
  const git = (...args: string[]) => execFileSync('git', ['-C', vaultRoot, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  if (realpathSync(git('rev-parse', '--show-toplevel')) !== vaultRoot ||
    git('status', '--porcelain', '--untracked-files=normal')) throw new Error('Vault must be clean and independently versioned')
  const commit = git('rev-parse', 'HEAD')
  const rawMap: unknown = JSON.parse(readFileSync(resolve(mapArg), 'utf8'))
  if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) throw new Error('Invalid project map')
  const map = Object.fromEntries(Object.entries(rawMap))
  const projectId = Object.hasOwn(map, projectSlug) ? map[projectSlug] : null
  if (typeof projectId !== 'string') throw new Error('Unmapped project')
  const source = createKnowledgeProjectionSource({ vaultRoot, projectScopeMap: map })
  const artifact = prepareCorpus({
    ...source,
    readDocument(path) {
      // A clean working tree can still contain ignored notes. Bind each included
      // source to HEAD, with Git's own filters accounting for checkout line endings.
      const committedHash = git('rev-parse', commit + ':' + path)
      const currentHash = git('hash-object', '--path=' + path, '--', path)
      if (!/^[a-f0-9]{40,64}$/.test(committedHash) || committedHash !== currentHash) {
        throw new Error('Publication source is not the captured Git version')
      }
      return source.readDocument(path)
    },
  }, { projectId, projectSlug })
  if (git('rev-parse', 'HEAD') !== commit || git('status', '--porcelain', '--untracked-files=normal')) throw new Error('Vault changed')
  const output = resolve(option('out') ?? 'data/openviking/corpus.json')
  // Reject lexical and symlink-resolved containment before creating directories.
  if (inside(vaultRoot, output)) throw new Error('Output cannot be inside the vault')
  let ancestor = dirname(output)
  while (!existsSync(ancestor)) ancestor = dirname(ancestor)
  if (inside(vaultRoot, realpathSync(ancestor))) throw new Error('Output cannot be inside the vault')
  mkdirSync(dirname(output), { recursive: true })
  if (inside(vaultRoot, realpathSync(dirname(output)))) throw new Error('Output cannot be inside the vault')
  const temporary = output + '.preparing'
  writeFileSync(temporary, JSON.stringify(artifact, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' })
  renameSync(temporary, output)
  console.log(JSON.stringify({ prepared: true, projectId, snapshotId: artifact.manifest.snapshot_id,
    documents: artifact.manifest.document_count, vaultCommit: commit }))
} catch {
  console.error('OpenViking preparation failed. Check explicit paths, clean vault, project mapping and publication eligibility.')
  process.exitCode = 1
}
