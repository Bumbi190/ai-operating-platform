import { describe, expect, it } from 'vitest'
import { findVendoredDefinition } from '../workflows/definitions'
import { deferredStoryOutputChecks } from '../workflows/action-prerequisites'
import { findAdapter } from '../workflows/adapters/registry'
import { summarizeStateEvidence } from '../workflows/evidence-consumption'

const definition = findVendoredDefinition('familje-stunden.monthly-release', 2)!
const instance = {
  def_key: definition.def_key, def_version: 2, def_hash: definition.def_hash,
  current_state: 'content_generation',
}
const deferred = (kind: string, changes = {}, spec = definition.spec) =>
  deferredStoryOutputChecks({ ...instance, ...changes }, spec, kind)

describe('story action entry prerequisites differ from completion outputs', () => {
  it('generation defers downstream validation and storyboard outputs', () => {
    expect(deferred('generate_monthly_story')).toEqual(['story_page_count', 'story_structurally_valid'])
  })
  it('validation still requires generated evidence', () => {
    expect(deferred('validate_monthly_story')).toEqual(['story_page_count'])
    expect(deferred('validate_monthly_story')).not.toContain('story_generated')
  })
  it.each(['observe_release_gate', 'constructor', '__proto__', 'publish'])('does not widen other actions: %s', kind => {
    expect(deferred(kind)).toEqual([])
  })
  it.each([
    { def_key: 'other' }, { def_version: 1 }, { def_version: 3 },
    { def_hash: 'a'.repeat(64) }, { current_state: 'approval_content' },
  ])('requires exact canonical placement and version: %j', changes => {
    expect(deferred('generate_monthly_story', changes)).toEqual([])
  })
  it('rejects a modified definition even with the expected stored hash', () => {
    expect(deferred('generate_monthly_story', {}, { ...definition.spec, states: [] })).toEqual([])
  })
  it('does not satisfy any completion check or alter the catalogue', () => {
    deferred('generate_monthly_story')
    const declared = findAdapter(definition.def_key)!.attestableChecks()
    const summary = summarizeStateEvidence(declared, instance.current_state, [], () => 'none')
    expect(summary.allSatisfied).toBe(false)
    expect(summary.satisfied).toEqual([])
    expect(declared.filter(c => c.state === instance.current_state && c.required).map(c => c.check_key).sort())
      .toEqual(['story_generated', 'story_page_count', 'story_structurally_valid'])
  })
})
