import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AtlasResponseMarkdown } from '@/components/platform/vnext/AtlasResponseMarkdown'

const render = (text: string) =>
  renderToStaticMarkup(<AtlasResponseMarkdown text={text} className="example" />)

describe('Atlas home response Markdown', () => {
  it('renders headings, emphasis and numbered links instead of exposing raw Markdown', () => {
    const url = 'https://github.com/Zie619/n8n-workflows/blob/94007c1445d9258a7da116646b79473e7c7c3282/workflows/Emailreadimap/1284_Emailreadimap_Markdown_Send.json'
    const html = render(['### Källor', '', '1. **AI Email with approval**', '', '[Källa](' + url + ')'].join('\n'))
    expect(html).toContain('<h3>Källor</h3>')
    expect(html).toContain('<strong>AI Email with approval</strong>')
    expect(html).toContain('<ol>')
    expect(html).toContain('href="' + url + '"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).not.toContain('### Källor')
    expect(html).not.toContain('**AI Email')
  })

  it('shortens long full-URL labels while keeping the original citation href', () => {
    const url = 'https://github.com/Zie619/n8n-workflows/blob/94007c1445d9258a7da116646b79473e7c7c3282/workflows/Emailsend/1628_Emailsend_Code_Automation_Webhook.json'
    const html = render('[' + url + '](' + url + ')')
    expect(html).toContain('href="' + url + '"')
    expect(html).toContain('Öppna källan')
    expect(html).not.toContain('>' + url + '</a>')
  })

  it('rejects active HTML and dangerous Markdown URL schemes', () => {
    const html = render('### Säkerhet\n\n<script>alert(1)</script>\n\n[skicka](javascript:alert(1))')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('href="javascript:')
    expect(html).toContain('<h3>Säkerhet</h3>')
  })

  it('keeps safe internal navigation in the same tab', () => {
    const html = render('[Samtal](/chat/123) och [rubrik](#del)')
    expect(html).toContain('href="/chat/123"')
    expect(html).toContain('href="#del"')
    expect(html).not.toContain('target="_blank"')
  })

  it('only replaces the Atlas home answer renderer, not voice or tool calls', () => {
    const component = readFileSync(resolve('components/platform/vnext/AtlasCommandCore.tsx'), 'utf8')
    const css = readFileSync(resolve('components/platform/vnext/AtlasHomeVNext.module.css'), 'utf8')
    expect(component).toContain("import { AtlasResponseMarkdown } from './AtlasResponseMarkdown'")
    expect(component).toContain('className={styles.responseMarkdown}')
    expect(component).toContain('text={readOnly ? observerAnswer : atlas.response}')
    expect(component).not.toContain('<p>{readOnly ? observerAnswer : atlas.response}</p>')
    expect(component).toContain('await atlas.sendMessage(text)')
    expect(component).toContain('onClick={handleVoiceToggle}')
    expect(css).toContain('.responseMarkdown a')
    expect(css).toContain('.responseMarkdown table')
    expect(css).toContain('overflow-wrap: anywhere')
  })
})
