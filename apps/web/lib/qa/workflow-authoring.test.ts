/**
 * Workflow authoring validation (Atlas can create/edit/validate/save workflows).
 *
 * Locks the rules save_workflow relies on: agent_id must exist in the project,
 * unique orders + output_keys, {{var}} resolvability (no forward refs), trigger/
 * cron sanity, and required-input extraction.
 */
import { describe, it, expect } from 'vitest'
import { validateWorkflowDraft } from '@/lib/atlas/workflow-authoring'

const AGENTS = ['ag_research', 'ag_writer', 'ag_qa']

const goodDraft = {
  name: 'News → Article',
  trigger: 'manual',
  steps: [
    { order: 1, name: 'Research', agent_id: 'ag_research', input_template: 'Research {{topic}}', output_key: 'research' },
    { order: 2, name: 'Write', agent_id: 'ag_writer', input_template: 'Write from {{research}}', output_key: 'draft' },
    { order: 3, name: 'QA', agent_id: 'ag_qa', input_template: 'Check {{draft}}', output_key: 'final' },
  ],
}

describe('validateWorkflowDraft', () => {
  it('accepts a well-formed workflow and extracts external inputs', () => {
    const v = validateWorkflowDraft(goodDraft, AGENTS)
    expect(v.valid).toBe(true)
    expect(v.errors).toEqual([])
    expect(v.requiredInputs).toEqual(['topic'])     // {{research}}/{{draft}} are produced internally
    expect(v.normalizedSteps).toHaveLength(3)
  })

  it('rejects an unknown agent_id', () => {
    const v = validateWorkflowDraft({ ...goodDraft, steps: [{ name: 'X', agent_id: 'ghost', output_key: 'k' }] }, AGENTS)
    expect(v.valid).toBe(false)
    expect(v.errors.some(e => /agent_id "ghost"/.test(e))).toBe(true)
  })

  it('flags a forward/self reference to a later output_key', () => {
    const v = validateWorkflowDraft({
      name: 'bad', steps: [
        { order: 1, name: 'A', agent_id: 'ag_writer', input_template: 'use {{later}}', output_key: 'early' },
        { order: 2, name: 'B', agent_id: 'ag_qa', input_template: 'x', output_key: 'later' },
      ],
    }, AGENTS)
    expect(v.valid).toBe(false)
    expect(v.errors.some(e => /produceras av ett senare/.test(e))).toBe(true)
  })

  it('rejects duplicate output_key and duplicate order', () => {
    const dupKey = validateWorkflowDraft({ name: 'd', steps: [
      { order: 1, name: 'A', agent_id: 'ag_writer', output_key: 'k' },
      { order: 2, name: 'B', agent_id: 'ag_qa', output_key: 'k' },
    ] }, AGENTS)
    expect(dupKey.valid).toBe(false)
    expect(dupKey.errors.some(e => /output_key "k" är inte unik/.test(e))).toBe(true)

    const dupOrder = validateWorkflowDraft({ name: 'd', steps: [
      { order: 1, name: 'A', agent_id: 'ag_writer', output_key: 'a' },
      { order: 1, name: 'B', agent_id: 'ag_qa', output_key: 'b' },
    ] }, AGENTS)
    expect(dupOrder.valid).toBe(false)
    expect(dupOrder.errors.some(e => /order: dubblett/.test(e))).toBe(true)
  })

  it('requires name and at least one step', () => {
    const v = validateWorkflowDraft({ name: '', steps: [] }, AGENTS)
    expect(v.valid).toBe(false)
    expect(v.errors.some(e => /name: krävs/.test(e))).toBe(true)
    expect(v.errors.some(e => /minst ett steg/.test(e))).toBe(true)
  })

  it('requires cron_expr when trigger is cron, and validates trigger enum', () => {
    const noCron = validateWorkflowDraft({ ...goodDraft, trigger: 'cron' }, AGENTS)
    expect(noCron.valid).toBe(false)
    expect(noCron.errors.some(e => /cron_expr: krävs/.test(e))).toBe(true)

    const okCron = validateWorkflowDraft({ ...goodDraft, trigger: 'cron', cron_expr: '0 7 * * *' }, AGENTS)
    expect(okCron.valid).toBe(true)

    const badTrigger = validateWorkflowDraft({ ...goodDraft, trigger: 'whenever' }, AGENTS)
    expect(badTrigger.valid).toBe(false)
    expect(badTrigger.errors.some(e => /trigger: måste vara/.test(e))).toBe(true)
  })

  it('rejects a malformed output_key', () => {
    const v = validateWorkflowDraft({ name: 'd', steps: [
      { name: 'A', agent_id: 'ag_writer', output_key: '1 bad key' },
    ] }, AGENTS)
    expect(v.valid).toBe(false)
    expect(v.errors.some(e => /output_key .* måste vara alfanumeriskt/.test(e))).toBe(true)
  })

  it('auto-orders steps that omit order and warns', () => {
    const v = validateWorkflowDraft({ name: 'd', steps: [
      { name: 'A', agent_id: 'ag_research', input_template: '{{topic}}', output_key: 'a' },
      { name: 'B', agent_id: 'ag_writer', input_template: '{{a}}', output_key: 'b' },
    ] }, AGENTS)
    expect(v.valid).toBe(true)
    expect(v.normalizedSteps.map(s => s.order)).toEqual([1, 2])
    expect(v.warnings.some(w => /order saknades/.test(w))).toBe(true)
  })
})
