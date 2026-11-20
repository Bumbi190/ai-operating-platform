import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))

import {
  extractOfficialArticleText,
  matchOfficialDeepMindIndexLink,
} from '@/lib/article/primary-source-reader'

const paragraph = [
  'The laboratory described a new research model at its official launch,',
  'explaining the precise test conditions and limitations of the system.',
  'The team also clarified that initial release eligibility differs from',
  'general availability, and that its performance claims use named benchmarks.',
].join(' ')
const article = '<main><article><h1>Introducing Gemini 4 Neon</h1>'
  + Array.from({length:7},(_,i) => '<p>Paragraph '+(i+1)+': '+paragraph+'</p>').join('')
  + '</article></main>'

describe('bounded primary-source HTML parser', () => {
  it('extracts source paragraphs under matching article title', () => {
    const text = extractOfficialArticleText(article, 'Introducing Gemini 4 Neon')
    expect(text).not.toBeNull()
    expect(text?.split(/\s+/).length).toBeGreaterThan(150)
    expect(text).toContain('limitations')
  })

  it('preserves benchmark headings, list qualifiers and paragraph boundaries', () => {
    const html = '<main><article><h1>Introducing Gemini 4 Neon</h1>'
      +'<h2>Results at xhigh thinking level</h2>'
      +'<ul><li>Cost per task is reported at xhigh on a named evaluation with a company baseline.</li></ul>'
      +Array.from({length:7},(_,i) => '<p>'+paragraph+' Context '+i+'.</p>').join('')
      +'</article></main>'
    const result = extractOfficialArticleText(html, 'Introducing Gemini 4 Neon')
    expect(result).not.toBeNull()
    expect(result).toContain('## Results at xhigh thinking level')
    expect(result).toContain('Cost per task is reported at xhigh')
    expect(result).toContain('\n\n')
  })

  it('rejects mismatched titles and navigation-only pages', () => {
    expect(extractOfficialArticleText(article, 'OpenAI Launches Another Model')).toBeNull()
    const nav = '<nav>'+paragraph.repeat(4)+'</nav><h1>Introducing Gemini 4 Neon</h1>'
    expect(extractOfficialArticleText(nav, 'Introducing Gemini 4 Neon')).toBeNull()
  })

  it('ignores script/navigation/footer text within the article', () => {
    const html = '<main><article><h1>Introducing Gemini 4 Neon</h1>'
      +'<nav>'+paragraph.repeat(3)+'</nav>'
      +'<script>'+paragraph.repeat(3)+'</script>'
      +'<footer>'+paragraph.repeat(3)+'</footer>'
      +'<p>'+paragraph+'</p></article></main>'
    expect(extractOfficialArticleText(html, 'Introducing Gemini 4 Neon')).toBeNull()
  })

  it('recognizes only title-correlated first-party Google index URLs', () => {
    const html = '<main><h3>Introducing Gemini 4 Neon</h3>'
      +'<a href="https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-4-neon/?utm_source=deepmind.google">Learn more</a>'
      +'<a href="https://evil.google.evil.example/introducing-gemini-4-neon/">Evil mirror</a></main>'
    expect(matchOfficialDeepMindIndexLink(html, 'Introducing Gemini 4 Neon')).toBe(
      'https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-4-neon/',
    )
    expect(matchOfficialDeepMindIndexLink(html, 'Completely Different Announcement')).toBeNull()
  })
})
