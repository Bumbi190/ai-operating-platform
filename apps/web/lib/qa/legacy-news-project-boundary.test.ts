import {describe, expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import {resolve, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {isLegacyNewsPipelineProject} from '../project/legacy-news-pipeline'

const web = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const source = (relative: string) => readFileSync(resolve(web, relative), 'utf8')

describe('legacy AI-news navigation: project boundary', () => {
  it('shows news affordances for the two existing news project identities only', () => {
    expect(isLegacyNewsPipelineProject('the-prompt')).toBe(true)
    expect(isLegacyNewsPipelineProject('ai-media-automation')).toBe(true)
    for (const slug of ['familje-stunden', 'handlarborsen', 'gainpilot', '', 'THE-PROMPT', undefined, null]) {
      expect(isLegacyNewsPipelineProject(slug)).toBe(false)
    }
  })

  it('hides legacy news and script pages for a different project', () => {
    for (const page of ['news', 'scripts']) {
      const code = source('app/(platform)/projects/[slug]/' + page + '/layout.tsx')
      expect(code).toContain('access.allowedProjectIds.includes(project.id)')
      expect(code).toContain('!isLegacyNewsPipelineProject(project.slug)')
      expect(code).toContain('notFound()')
    }
  })

  it('removes Breaking, News and Scripts links from a non-news media dashboard', () => {
    const code = source('app/(platform)/projects/[slug]/media/page.tsx')
    expect(code).toContain('const isNewsProject = isLegacyNewsPipelineProject(project.slug)')
    expect(code).toMatch(/\{isNewsProject && \(\s*<div[\s\S]*?<BreakingButton/)
    expect(code).toContain('media.enabled')
  })

  it('preserves existing owner authorization and platform publish limits in all media APIs', () => {
    const breaking = source('app/api/media/breaking/route.ts')
    expect(breaking).toContain('assertProjectAllowed(body.project_id, allowedProjectIds)')
    expect(breaking).toContain('const mayPublishToPlatform = viaCron || (await resolvePlatformOperator()).ok')
    for (const file of [
      'app/api/media/voice/route.ts',
      'app/api/media/images/generate/route.ts',
      'app/api/media/render/start/route.ts',
    ]) {
      const code = source(file)
      expect(code).toContain("scopeProjectFilter(allowedProjectIds)")
      expect(code).not.toContain('isLegacyNewsPipelineProject')
    }
    const music = source('app/api/media/music/generate/route.ts')
    expect(music).toContain('assertProjectAllowed(projectId, access.allowedProjectIds)')
    expect(music).not.toContain('isLegacyNewsPipelineProject')
  })
})
