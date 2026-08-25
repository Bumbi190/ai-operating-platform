/**
 * DESKTOP COMMANDER PHASE 0 — the capability is declared and stays unreachable.
 *
 * Phase 0's whole deliverable is a boundary that nothing crosses. A document
 * cannot enforce that, so this suite owns the two ways the boundary could be
 * lost in practice:
 *
 *   1. The DECLARATION is quietly relaxed — a status bumped off `draft`, a
 *      level raised above L0, the refusal turned into an approval.
 *   2. The MCP is WIRED IN — a client, a spawn, or an import that gives some
 *      production path a way to actually reach the host.
 *
 * ── WHY THE SCANS ASSERT ON REACHABILITY, NOT ON THE NAME ────────────────────
 *
 * "desktop-commander" and "desktop.commander" appear legitimately in this
 * repository: in the capability declaration, in this file's own assertions, and
 * in the architecture documents that explain why the capability is refused. A
 * substring ban on the name would trip over its own documentation and push a
 * later maintainer toward deleting the prose that makes the invariant legible.
 * So the scans target the things that would actually create capability — an
 * import of the MCP package, a spawn of its binary, a client construction.
 *
 * `execFileSync` takes an argv and never a shell string: this repository's path
 * contains spaces ("AI Operating Platform"), and a shell-interpolated `grep`
 * word-splits into non-existent paths, making the scan silently empty and the
 * assertion unfalsifiable.
 */

import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  DESKTOP_COMMANDER_AUTONOMOUS_EXECUTION,
  DESKTOP_COMMANDER_AUTONOMY_LEVEL,
  DESKTOP_COMMANDER_LICENSE_STATUS,
  DESKTOP_COMMANDER_PREREQUISITES,
  DESKTOP_COMMANDER_PROHIBITED_RESPONSIBILITIES,
  DESKTOP_COMMANDER_TOOL_BOUND,
  DESKTOP_COMMANDER_TOOL_ID,
  desktopCommanderAvailability,
  requestsDesktopCommander,
} from '@/lib/atlas/capability/desktop-commander'

const WEB_ROOT = resolve(__dirname, '../..')
const DECLARATION = 'lib/atlas/capability/desktop-commander.ts'

/** Files under app/ and lib/ matching a pattern, excluding this QA directory. */
const productionMatches = (pattern: string): string[] => {
  let out = ''
  try {
    out = execFileSync('grep', ['-rlE', pattern, `${WEB_ROOT}/app`, `${WEB_ROOT}/lib`], { encoding: 'utf8' })
  } catch (e) {
    const err = e as { status?: number }
    if (err.status !== 1) throw e   // 1 = no match at all, which is the pass
  }
  return out.trim().split('\n').filter(Boolean).filter(f => !f.includes('/qa/'))
}

describe('the declaration grants nothing', () => {
  it('the license status is the canonical Ch18.49 `draft` — §18.50 grants no authority', () => {
    expect(DESKTOP_COMMANDER_LICENSE_STATUS).toBe('draft')
  })

  it('the autonomy level is the canonical Ch18.10 L0 — Observe', () => {
    expect(DESKTOP_COMMANDER_AUTONOMY_LEVEL).toBe('L0')
  })

  it('autonomous execution is false', () => {
    expect(DESKTOP_COMMANDER_AUTONOMOUS_EXECUTION).toBe(false)
  })

  it('the tool bound carries a restriction — an unrestricted bound must not be the shape copied', () => {
    // attenuate.ts folds `restriction` into the containment key precisely so a
    // child cannot drop it and inherit an unrestricted tool.
    expect(DESKTOP_COMMANDER_TOOL_BOUND.tool).toBe(DESKTOP_COMMANDER_TOOL_ID)
    expect(DESKTOP_COMMANDER_TOOL_BOUND.restriction ?? '').not.toBe('')
  })

  it('the prohibited-responsibility and prerequisite lists are populated', () => {
    // An empty list would pass every "is it in the list?" check vacuously.
    expect(DESKTOP_COMMANDER_PROHIBITED_RESPONSIBILITIES.length).toBeGreaterThan(0)
    expect(DESKTOP_COMMANDER_PREREQUISITES.length).toBeGreaterThan(0)
    expect(DESKTOP_COMMANDER_PREREQUISITES).toContain('execution_isolation')
    expect(DESKTOP_COMMANDER_PREREQUISITES).toContain('autonomy_license')
  })

  it('Desktop Commander may never own delegation, authorization or memory', () => {
    for (const forbidden of ['delegation', 'project_authorization', 'atlas_memory']) {
      expect(DESKTOP_COMMANDER_PROHIBITED_RESPONSIBILITIES).toContain(forbidden)
    }
  })
})

describe('the availability seam refuses unconditionally', () => {
  const query = {
    projectId: 'p-1',
    missionId: 'm-1',
    missionVersion: 1,
    tools: [DESKTOP_COMMANDER_TOOL_BOUND],
    dataScope: [{ resource: 'workspace', access: 'write' as const }],
  }

  it('reports neither tools nor data available', async () => {
    const result = await desktopCommanderAvailability(query)
    expect(result.tools).toBe(false)
    expect(result.data).toBe(false)
  })

  it('names what it refused, so a Manager can cite §21.16 tool_unavailable', async () => {
    const result = await desktopCommanderAvailability(query)
    expect(result.unavailable).toContain(DESKTOP_COMMANDER_TOOL_ID)
    expect(result.unavailable).toContain('workspace')
  })

  it('no mission identity changes the answer', async () => {
    const other = await desktopCommanderAvailability({
      ...query, projectId: 'p-2', missionId: 'm-2', missionVersion: 99,
    })
    expect(other.tools).toBe(false)
    expect(other.data).toBe(false)
  })

  it('the predicate detects the identifier without authorizing it', () => {
    expect(requestsDesktopCommander([DESKTOP_COMMANDER_TOOL_BOUND])).toBe(true)
    expect(requestsDesktopCommander([{ tool: 'web.search', restriction: null }])).toBe(false)
  })
})

describe('nothing in production can reach the host', () => {
  it('the scan can actually fail — it finds the production tree', () => {
    // Guards against a silently-empty scan making every assertion below vacuous.
    expect(productionMatches('export').length).toBeGreaterThan(50)
  })

  it('no module imports the Desktop Commander MCP package', () => {
    expect(productionMatches('@wonderwhy-er/desktop-commander')).toEqual([])
  })

  it('no module spawns the Desktop Commander server', () => {
    expect(productionMatches('desktop-commander.*(start|stdio|serve)')).toEqual([])
  })

  it('no module opens an MCP client or transport at all', () => {
    expect(productionMatches('@modelcontextprotocol/sdk|StdioClientTransport')).toEqual([])
  })

  it('the declaration itself has no client, no spawn and no filesystem import', () => {
    const src = readFileSync(resolve(WEB_ROOT, DECLARATION), 'utf8')
    expect(src).not.toMatch(/from ['"]node:(child_process|fs)['"]/)
    expect(src).not.toMatch(/\b(spawn|exec|execFile|execSync)\s*\(/)
    expect(src).not.toMatch(/\bfetch\s*\(/)
  })

  it('the declaration is imported by no production module', () => {
    // Phase 0 is inert by construction: declared, and wired to nothing.
    expect(productionMatches("lib/atlas/capability/desktop-commander")).toEqual([resolve(WEB_ROOT, DECLARATION)])
  })
})
