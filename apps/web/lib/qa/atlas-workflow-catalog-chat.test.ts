import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const route = readFileSync(resolve(process.cwd(), 'app/api/chat/route.ts'), 'utf8')

describe('Atlas workflow catalog chat integration', () => {
  it('registers the read-only discovery tool exactly once', () => {
    expect(route.match(/name: 'list_atlas_workflow_catalog'/g)).toHaveLength(1)
    expect(route).toContain("import { listAtlasWorkflowCatalog } from '@/lib/atlas/workflow-catalog'")
  })

  it('handles catalog reads separately from existing executable workflow actions', () => {
    expect(route).toMatch(
      /if \(name === 'list_atlas_workflow_catalog'\) \{\s*return listAtlasWorkflowCatalog\(\)\s*\}/,
    )
    expect(route.indexOf("if (name === 'list_atlas_workflow_catalog')")).toBeLessThan(
      route.indexOf("if (name === 'list_workflows')"),
    )
  })
})
