import { describe, expect, it } from 'vitest'
import { planCreativeTask } from '../media/creative-routing'

describe('Atlas creative planning', () => {
  it('prefers an editor for existing assets only when locally discovered', () => {
    expect(planCreativeTask('image-retouch', ['photocraft']).preferred).toBe('photocraft')
    expect(planCreativeTask('image-retouch').preferred).toBe('existing-image-pipeline')
    expect(planCreativeTask('video-timeline-edit', ['filmcraft']).preferred).toBe('filmcraft')
    expect(planCreativeTask('video-timeline-edit').preferred).toBe('remotion')
  })

  it('preserves proven data and generation pathways', () => {
    expect(planCreativeTask('interactive-data-chart', ['photocraft']).preferred).toBe('react-chart')
    expect(planCreativeTask('templated-social-video', ['filmcraft']).preferred).toBe('remotion')
    expect(planCreativeTask('new-illustration', ['photocraft']).preferred).toBe('existing-image-generator')
    expect(planCreativeTask('simple-video-transcode', ['filmcraft']).preferred).toBe('ffmpeg')
  })

  it('never grants execution via route selection', () => {
    expect(planCreativeTask('image-retouch', ['photocraft']).externalToolRequired).toBe(true)
    expect(planCreativeTask('image-retouch', ['photocraft']).requiresReview).toBe(true)
    expect(planCreativeTask('image-retouch', ['photocraft']).executionAuthorized).toBe(false)
  })
})
