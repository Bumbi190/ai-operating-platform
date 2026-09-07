import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { executeLegacyDelegate } from '@/lib/atlas/legacy-delegate'

const ALLOWED_PROJECT = '11111111-1111-4111-8111-111111111111'
const FOREIGN_PROJECT = '22222222-2222-4222-8222-222222222222'

interface DbScenario {
  resolvedProject?: string | null
  resolutionError?: boolean
  resolutionThrows?: boolean
  taskWriteThrows?: boolean
}

function makeDb(scenario: DbScenario = {}) {
  const managerWrites: Array<Record<string, unknown>> = []
  const messageWrites: Array<Record<string, unknown>> = []
  const events: string[] = []
  const projectScopes: string[][] = []

  const db = {
    from(table: string) {
      if (table === 'projects') {
        return {
          select() {
            return {
              eq() {
                return {
                  in(_column: string, values: string[]) {
                    projectScopes.push(values)
                    return {
                      async maybeSingle() {
                        events.push('project_resolution')
                        if (scenario.resolutionThrows) throw new Error('resolver unavailable')
                        if (scenario.resolutionError) {
                          return { data: null, error: new Error('lookup failed') }
                        }
                        return {
                          data: scenario.resolvedProject
                            ? { id: scenario.resolvedProject }
                            : null,
                          error: null,
                        }
                      },
                    }
                  },
                }
              },
            }
          },
        }
      }

      if (table === 'manager_tasks') {
        return {
          insert(payload: Record<string, unknown>) {
            events.push('manager_tasks_write')
            managerWrites.push(payload)
            if (scenario.taskWriteThrows) throw new Error('task write failed')
            return {
              select() {
                return {
                  async single() {
                    return {
                      data: {
                        id: `task-${managerWrites.length}`,
                        title: payload.title,
                        status: payload.status,
                      },
                      error: null,
                    }
                  },
                }
              },
            }
          },
        }
      }

      if (table === 'agent_messages') {
        return {
          async insert(payload: Record<string, unknown>) {
            events.push('agent_messages_write')
            messageWrites.push(payload)
            return { data: null, error: null }
          },
        }
      }

      throw new Error(`unexpected table: ${table}`)
    },
  }

  return { db, managerWrites, messageWrites, events, projectScopes }
}

type DelegateDb = Parameters<typeof executeLegacyDelegate>[0]

async function delegate(
  fixture: ReturnType<typeof makeDb>,
  projectId: string | undefined,
  allowedProjectIds: string[],
) {
  return executeLegacyDelegate(
    fixture.db as unknown as DelegateDb,
    {
      goal: 'Launch campaign',
      project_id: projectId,
      tasks: [
        { title: 'Research', agent: 'Research Agent' },
        { title: 'Draft' },
      ],
    },
    allowedProjectIds,
  )
}

function expectZeroWrites(fixture: ReturnType<typeof makeDb>) {
  expect(fixture.managerWrites).toEqual([])
  expect(fixture.messageWrites).toEqual([])
  expect(fixture.events).not.toContain('manager_tasks_write')
  expect(fixture.events).not.toContain('agent_messages_write')
}

describe('legacy /api/chat delegate isolation boundary', () => {
  it('A: rejects a foreign project UUID with zero delegation writes', async () => {
    const fixture = makeDb()
    const result = await delegate(fixture, FOREIGN_PROJECT, [ALLOWED_PROJECT])

    expect(result).toHaveProperty('error')
    expect(fixture.events).toEqual([])
    expectZeroWrites(fixture)
  })

  it('B: rejects an omitted project with zero delegation writes', async () => {
    const fixture = makeDb({ resolvedProject: ALLOWED_PROJECT })
    const result = await delegate(fixture, undefined, [ALLOWED_PROJECT])

    expect(result).toHaveProperty('error')
    expect(fixture.events).toEqual([])
    expectZeroWrites(fixture)
  })

  it('C: rejects an empty allow-list with zero delegation writes', async () => {
    const fixture = makeDb({ resolvedProject: ALLOWED_PROJECT })
    const result = await delegate(fixture, 'gainpilot', [])

    expect(result).toHaveProperty('error')
    expect(fixture.projectScopes).toEqual([['00000000-0000-0000-0000-000000000000']])
    expectZeroWrites(fixture)
  })

  it('D: rejects a malformed project UUID with zero delegation writes', async () => {
    const fixture = makeDb()
    const result = await delegate(fixture, '%%%not-a-uuid%%%', [ALLOWED_PROJECT])

    expect(result).toHaveProperty('error')
    expect(fixture.events).toEqual([])
    expectZeroWrites(fixture)
  })

  it('E: rejects a resolved project not present in allowedProjectIds', async () => {
    const fixture = makeDb({ resolvedProject: FOREIGN_PROJECT })
    const result = await delegate(fixture, 'gainpilot', [ALLOWED_PROJECT])

    expect(result).toHaveProperty('error')
    expect(fixture.projectScopes).toEqual([[ALLOWED_PROJECT]])
    expectZeroWrites(fixture)
  })

  it('F: fails closed when project resolution returns an error', async () => {
    const fixture = makeDb({ resolutionError: true })
    const result = await delegate(fixture, 'gainpilot', [ALLOWED_PROJECT])

    expect(result).toHaveProperty('error')
    expectZeroWrites(fixture)
  })

  it('G: cannot enter a partial-write state when isolation resolution throws', async () => {
    const fixture = makeDb({ resolutionThrows: true, taskWriteThrows: true })
    const result = await delegate(fixture, 'gainpilot', [ALLOWED_PROJECT])

    expect(result).toHaveProperty('error')
    expect(fixture.events).toEqual(['project_resolution'])
    expectZeroWrites(fixture)
  })

  it('H/I/J: succeeds for an allowed project and reuses its resolved id for every write', async () => {
    const fixture = makeDb({ resolvedProject: ALLOWED_PROJECT })
    const result = await delegate(fixture, 'gainpilot', [ALLOWED_PROJECT])

    expect(result).toMatchObject({ goal: 'Launch campaign', created: 2 })
    expect(fixture.managerWrites).toHaveLength(2)
    expect(fixture.messageWrites).toHaveLength(1)
    expect(fixture.managerWrites.map((write) => write.project_id)).toEqual([
      ALLOWED_PROJECT,
      ALLOWED_PROJECT,
    ])
    expect(fixture.messageWrites[0]?.project_id).toBe(ALLOWED_PROJECT)
    expect(fixture.events[0]).toBe('project_resolution')
    expect(fixture.events.indexOf('project_resolution')).toBeLessThan(
      fixture.events.indexOf('manager_tasks_write'),
    )
    expect(fixture.events.indexOf('project_resolution')).toBeLessThan(
      fixture.events.indexOf('agent_messages_write'),
    )
  })

  it('negative control: a query adapter that ignores its scope still cannot authorize a foreign id', async () => {
    // Mutation control: this fake returns a foreign id despite receiving the
    // correct `.in(id, allowedProjectIds)` scope. Removing the final
    // assertProjectAllowed check in resolveOwnedProjectId makes this test write
    // manager_tasks and agent_messages and therefore fail.
    const fixture = makeDb({ resolvedProject: FOREIGN_PROJECT })
    await delegate(fixture, 'gainpilot', [ALLOWED_PROJECT])

    expect(fixture.projectScopes).toEqual([[ALLOWED_PROJECT]])
    expectZeroWrites(fixture)
  })

  it('the production chat route delegates to the boundary and contains no global fallback', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/chat/route.ts'), 'utf8')
    const delegateBranch = route.slice(
      route.indexOf("if (name === 'delegate')"),
      route.indexOf("if (name === 'present_links')"),
    )

    expect(delegateBranch).toContain('executeLegacyDelegate')
    expect(delegateBranch).not.toContain("from('projects')")
    expect(delegateBranch).not.toContain('.limit(1).maybeSingle()')
    expect(delegateBranch).not.toMatch(/projectId\s*=\s*project_id/)
  })
})
