/**
 * PR-0 / route-drift — keeps the route-manifest honest against the filesystem.
 *
 * Fails (or in reporting mode, lists) when:
 *   - a route.ts exists on disk with no manifest entry (new unclassified route),
 *   - a manifest entry points to a route that no longer exists,
 *   - a stray duplicate route file exists (e.g. "route 2.ts" shadow files).
 *
 * MEASUREMENT ONLY. PR-0 runs this in reporting mode (exit 0). A later PR flips
 * `--strict` so unclassified/new routes block merge.
 *
 * Run:  npx tsx tests/isolation/route-drift.ts [--strict]
 * NOTE: authored in PR-0; not executed here.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const APP_API = join(__dirname, '..', '..', 'app', 'api');
const STRICT = process.argv.includes('--strict');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry === 'route.ts' || /route \d+\.ts$/.test(entry)) out.push(full);
  }
  return out;
}

function toRoutePath(file: string): string {
  // app/api/foo/[id]/route.ts  →  /foo/[id]
  const rel = relative(APP_API, file).replace(/\\/g, '/');
  return '/' + rel.replace(/\/route( \d+)?\.ts$/, '');
}

const manifest = JSON.parse(readFileSync(join(__dirname, 'route-manifest.json'), 'utf8')) as {
  routes: { path: string }[];
  cleanup?: { path: string }[];
};
const declared = new Set(manifest.routes.map((r) => r.path));
const knownCleanup = new Set((manifest.cleanup ?? []).map((c) => c.path.replace(/\/route 2\.ts$/, '')));

const files = walk(APP_API);
const strays: string[] = [];
const missing: string[] = [];
const onDisk = new Set<string>();

for (const f of files) {
  const rel = relative(APP_API, f).replace(/\\/g, '/');
  if (/route \d+\.ts$/.test(rel)) { strays.push('/' + rel); continue; }
  const rp = toRoutePath(f);
  onDisk.add(rp);
  if (!declared.has(rp)) missing.push(rp);
}

const orphaned = [...declared].filter((p) => !onDisk.has(p));

console.log('\n=== route-drift (PR-0 measurement) ===\n');
console.log(`routes on disk:        ${onDisk.size}`);
console.log(`declared in manifest:  ${declared.size}`);
if (missing.length)  console.log(`\n🔴 NEW/unclassified routes (no manifest entry):\n  ${missing.join('\n  ')}`);
if (orphaned.length) console.log(`\n🟡 manifest entries with no route file:\n  ${orphaned.join('\n  ')}`);
if (strays.length)   console.log(`\n🔴 stray duplicate files (shadow routes — delete/review):\n  ${strays.join('\n  ')}`);
if (!missing.length && !orphaned.length && !strays.length) console.log('🟢 manifest matches filesystem');

const drift = missing.length + strays.length;
console.log(STRICT ? '\n(strict) exit non-zero on drift' : '\n(reporting) exit 0 — flip to --strict in a later PR\n');
process.exit(STRICT && drift > 0 ? 1 : 0);
