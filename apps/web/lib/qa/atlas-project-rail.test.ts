import { describe, expect, it } from 'vitest'
import { presentationForProject } from '@/lib/atlas/project-presentation'
import { resolveProjectRailKeyAction } from '@/lib/atlas/project-rail-keyboard'

const documentWithoutPrioritySurfaces = {
  querySelectorAll: () => [],
} as unknown as Document

function event(key: string) {
  return {
    key,
    defaultPrevented: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    target: null,
  } as const
}

describe('Atlas project rail presentation registry', () => {
  it('adds known artwork without becoming the project identity source', () => {
    expect(presentationForProject('ai-media-automation', 'Database name')).toMatchObject({
      shortLabel: 'The Prompt',
      heroImage: '/project-rail/the-prompt.jpg',
    })
  })

  it('falls back to the authorized database name when artwork is unknown', () => {
    expect(presentationForProject('new-authorized-project', 'Nytt projekt')).toEqual({
      shortLabel: 'Nytt projekt',
    })
  })
})

describe('Atlas project rail keyboard contract', () => {
  it('maps rail navigation and project return keys by context', () => {
    expect(resolveProjectRailKeyAction(event('ArrowLeft'), 'atlas', documentWithoutPrioritySurfaces)).toBe('previous')
    expect(resolveProjectRailKeyAction(event('ArrowRight'), 'atlas', documentWithoutPrioritySurfaces)).toBe('next')
    expect(resolveProjectRailKeyAction(event('Enter'), 'atlas', documentWithoutPrioritySurfaces)).toBe('open')
    expect(resolveProjectRailKeyAction(event('Escape'), 'project-detail', documentWithoutPrioritySurfaces)).toBe('return')
    expect(resolveProjectRailKeyAction(event('Backspace'), 'project-detail', documentWithoutPrioritySurfaces)).toBe('return')
  })

  it('does not steal modified or already handled keyboard events', () => {
    expect(resolveProjectRailKeyAction({ ...event('ArrowRight'), metaKey: true }, 'atlas', documentWithoutPrioritySurfaces)).toBeNull()
    expect(resolveProjectRailKeyAction({ ...event('Backspace'), defaultPrevented: true }, 'project-detail', documentWithoutPrioritySurfaces)).toBeNull()
  })

  it('does not steal keys from editable fields or higher-priority surfaces', () => {
    const editableTarget = {
      closest: () => ({ tagName: 'INPUT' }),
      isContentEditable: false,
    } as unknown as EventTarget
    const documentWithDialog = {
      querySelectorAll: () => [{ hidden: false, getAttribute: () => null }],
    } as unknown as Document

    expect(resolveProjectRailKeyAction(
      { ...event('ArrowRight'), target: editableTarget },
      'atlas',
      documentWithoutPrioritySurfaces,
    )).toBeNull()
    expect(resolveProjectRailKeyAction(event('Backspace'), 'project-detail', documentWithDialog)).toBeNull()
  })
})
