import { describe, expect, it } from 'vitest'
import { asAssetId } from '../media/asset/types'
import { planCreativeTask } from '../media/creative-routing'
import { prepareCreativeWorkDraft } from '../media/creative-work-draft'

const source = {
  id: asAssetId('00000000-0000-4000-8000-000000000001'),
  projectId: 'familje-stunden',
  kind: 'image' as const,
  status: 'active' as const,
  checksumSha256: 'a'.repeat(64),
}
const imageTask = {
  workId: 'sample003',
  projectId: 'familje-stunden',
  intent: 'image-retouch' as const,
  asset: source,
  editingGoal: 'Adjust title text and contrast',
}

describe('creative work proposal safety boundary', () => {
  it('creates only a preview draft, with no executable instructions', () => {
    const result = prepareCreativeWorkDraft(imageTask, planCreativeTask('image-retouch',['photocraft']))
    expect(result.suggestedEngine).toBe('photocraft')
    expect(result.status).toBe('draft')
    expect(result.assetVisibility).toBe('internal')
    expect(result.executionAuthorized).toBe(false)
    expect(result.publishAuthorized).toBe(false)
    expect(result.remoteToolCall).toBeNull()
  })

  it('refuses cross-project assets and incompatible media', () => {
    const route = planCreativeTask('image-retouch')
    expect(() => prepareCreativeWorkDraft({...imageTask, asset: {...source, projectId:'handlarborsen'}}, route)).toThrow()
    expect(() => prepareCreativeWorkDraft({...imageTask, asset: {...source, kind:'video'}}, route)).toThrow()
    expect(() => prepareCreativeWorkDraft(imageTask, planCreativeTask('video-timeline-edit'))).toThrow()
  })
})
