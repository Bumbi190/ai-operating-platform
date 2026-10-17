import {describe, expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import {resolve, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {isLegacyNewsPipelineProject} from '../project/legacy-news-pipeline'

const web = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const source = (relative: string) => readFileSync(resolve(web, relative), 'utf8')

describe('legacy AI-news media project boundary', () => {
  it('accepts only the two existing news-pipeline identities', () => {
    expect(isLegacyNewsPipelineProject('the-prompt')).toBe(true)
    expect(isLegacyNewsPipelineProject('ai-media-automation')).toBe(true)
    for (const slug of ['familje-stunden', 'handlarborsen', 'gainpilot', '', 'THE-PROMPT', undefined, null]) {
      expect(isLegacyNewsPipelineProject(slug)).toBe(false)
    }
  })

  it('hides legacy News and Scripts pages for non-news projects even if their project IDs are owned', () => {
    for (const page of ['news', 'scripts']) {
      const file = source('app/(platform)/projects/[slug]/' + page + '/layout.tsx')
      expect(file).toContain('access.allowedProjectIds.includes(project.id)')
      expect(file).toContain('!isLegacyNewsPipelineProject(project.slug)')
      expect(file).toContain('notFound()')
    }
  })

  it('does not offer The Prompt paid breaking/news buttons on another project media dashboard', () => {
    const page = source('app/(platform)/projects/[slug]/media/page.tsx')
    expect(page).toContain('const isNewsProject = isLegacyNewsPipelineProject(project.slug)')
    expect(page).toMatch(/\{isNewsProject && \(\s*<div[\s\S]*?<BreakingButton/)
  })

  it('refuses foreign-pipeline calls before any paid provider dispatch', () => {
    const cases: [string, string, string][] = [
      ['app/api/media/breaking/route.ts', 'if (!isLegacyNewsPipelineProject(project.slug))', 'getAnthropic({'],
      ['app/api/media/voice/route.ts', 'if (!isLegacyNewsPipelineProject(voiceProject?.slug))', 'await generateVoiceover('],
      ['app/api/media/images/generate/route.ts', 'if (!isLegacyNewsPipelineProject(imageProject?.slug))', 'await generateSceneImages('],
      ['app/api/media/music/generate/route.ts', 'if (!isLegacyNewsPipelineProject(musicProject?.slug))', 'await generateSoundEffect('],
      ['app/api/media/render/start/route.ts', 'if (!isLegacyNewsPipelineProject(renderProject?.slug))', 'await startLambdaRender('],
    ]
    for (const [file, guard, dispatch] of cases) {
      const code = source(file)
      const guardIndex = code.indexOf(guard)
      const dispatchIndex = code.indexOf(dispatch)
      expect(guardIndex, file + ' missing project-type guard').toBeGreaterThan(0)
      expect(dispatchIndex, file + ' missing provider dispatch').toBeGreaterThan(guardIndex)
      expect(code.slice(guardIndex, dispatchIndex), file + ' must fail closed').toContain('status: 403')
    }
  })
})
