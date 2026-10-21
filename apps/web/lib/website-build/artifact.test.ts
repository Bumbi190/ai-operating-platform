import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { parse } from 'parse5'
import { compileWebsiteArtifact, exportWebsiteZip, makePreviewDocument, WebsiteArtifactError } from './artifact'

function draft(bodyHtml = '<h1>Vår idé</h1><a href="about.html">Om oss</a>') {
  return {
    format: 'static-website.v1', title: 'Min hemsida',
    pages: [
      { key: 'index', title: 'Hem', bodyHtml, css: 'body{color:#123} @media(max-width:600px){h1{font-size:2rem}}', behaviors: [] },
      { key: 'about', title: 'Om oss', bodyHtml: '<h1>Vår idé</h1><p>Åsa bygger för små företag.</p><a href="index.html">Hem</a>', css: '', behaviors: [] },
    ],
  }
}

describe('static website artifacts', () => {
  it('tabs require an explicit validated group and preserve it in the artifact', () => {
    const input = draft('<button id="tab">Flik</button><div id="panel">Innehåll</div>')
    const withGroup = (groupId?: string) => ({ ...input, pages: [{ ...input.pages[0], behaviors: [{ kind: 'tabs', triggerId: 'tab', targetIds: ['panel'], ...(groupId === undefined ? {} : { groupId }) }] }] })
    expect(() => compileWebsiteArtifact(withGroup())).toThrow(WebsiteArtifactError)
    expect(() => compileWebsiteArtifact(withGroup('bad group'))).toThrow(WebsiteArtifactError)
    expect(compileWebsiteArtifact(withGroup('products')).pages[0].html).toContain('"groupId":"products"')
  })
  it('compiles_real_two_page_site', () => {
    const artifact = compileWebsiteArtifact(draft())
    expect(artifact.format).toBe('static-website.v1')
    expect(artifact.files.map(f => f.path)).toEqual(expect.arrayContaining(['index.html', 'about.html', 'website.js']))
    expect(artifact.pages[0].html).toContain('Vår idé')
    expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/)
  })
  it('export_preserves_utf8_and_hash', async () => {
    const artifact = compileWebsiteArtifact(draft())
    const archive = await JSZip.loadAsync(await exportWebsiteZip(artifact))
    expect(await archive.file('about.html')!.async('string')).toContain('Åsa bygger för små företag.')
    expect(await archive.file('website.js')!.async('string')).toContain('addEventListener')
    expect(compileWebsiteArtifact(JSON.parse(JSON.stringify(draft()))).sha256).toBe(artifact.sha256)
  })
  it('hash_is_independent_of_input_object_key_order', () => {
    const input = draft()
    const reordered = { pages: input.pages, title: input.title, format: input.format }
    expect(compileWebsiteArtifact(reordered).sha256).toBe(compileWebsiteArtifact(input).sha256)
  })
  it.each([
    '<script>alert(1)</script>', '<img src="https://bad.example/a.png">', '<img src="data:image/svg+xml;base64,PHN2Zz4=">',
    '<div onclick="alert(1)">Hi</div>', '<a href="javascript:alert(1)">Go</a>', '<a href="https://bad.example">Go</a>',
    '<base href="https://bad.example">', '<meta http-equiv="refresh" content="0;url=https://bad.example">',
    '<iframe src="/api/chat"></iframe>', '<object data="/api/chat"></object>', '<embed src="/api/chat">',
    '<svg><use href="/api/chat"></use></svg>', '<form action="/api/chat"><button>Skicka</button></form>',
    '<div id="x"></div><div id="x"></div>', '<a href="../other.html">Go</a>', '<a href="missing.html">Go</a>',
    '<template><script>alert(1)</script></template>', '<a href="//bad.example">Go</a>', '<img srcset="https://bad.example/a 2x">',
  ])('rejects_hostile_markup: %s', body => {
    expect(() => compileWebsiteArtifact(draft(body))).toThrow(WebsiteArtifactError)
  })
  it('rejects_path_traversal_and_duplicate_page_keys', () => {
    const input = draft()
    input.pages[0].key = '../evil'
    expect(() => compileWebsiteArtifact(input)).toThrow(WebsiteArtifactError)
    input.pages[0].key = 'about'
    expect(() => compileWebsiteArtifact(input)).toThrow(WebsiteArtifactError)
  })
  it('rejects_unknown_behavior_and_missing_targets', () => {
    const input: any = draft('<button id="menu">Meny</button><nav id="links" hidden>Hem</nav>')
    input.pages[0].behaviors = [{ kind: 'fetch', triggerId: 'menu', targetIds: ['links'] }]
    expect(() => compileWebsiteArtifact(input)).toThrow(WebsiteArtifactError)
    input.pages[0].behaviors[0].kind = 'toggle'
    input.pages[0].behaviors[0].targetIds = ['missing']
    expect(() => compileWebsiteArtifact(input)).toThrow(WebsiteArtifactError)
  })
  it('compiles_mobile_menu_and_tabs_without_model_code', () => {
    const input: any = draft('<button id="menu" aria-expanded="false">Meny</button><nav id="links" hidden>Hem</nav>')
    input.pages[0].behaviors = [{ kind: 'toggle', triggerId: 'menu', targetIds: ['links'] }]
    const artifact = compileWebsiteArtifact(input)
    expect(artifact.pages[0].html).toContain('menu')
    expect(artifact.files.find(f => f.path === 'website.js')!.content).toContain('aria-expanded')
  })
  it('rejects_oversized_packages_without_truncation', () => {
    expect(() => compileWebsiteArtifact(draft('<p>' + 'å'.repeat(600_000) + '</p>'))).toThrow(WebsiteArtifactError)
    const input = draft()
    input.pages = Array.from({ length: 9 }, (_, i) => ({ ...input.pages[0], key: i === 0 ? 'index' : `page-${i}` }))
    expect(() => compileWebsiteArtifact(input)).toThrow(WebsiteArtifactError)
  })
  it('does_not_fake_form_delivery', () => {
    const artifact = compileWebsiteArtifact(draft('<form><label for="email">E-post</label><input id="email" type="email"><button type="submit">Skicka</button></form>'))
    expect(artifact.integrationNeeds).toContain('form_delivery')
    expect(artifact.pages[0].html).toContain('Formuläret behöver en ansluten mottagare')
    expect(artifact.pages[0].html).not.toContain('Meddelandet har skickats')
  })
  it('preview_is_sandbox_document_with_private_navigation_channel', () => {
    const artifact = compileWebsiteArtifact(draft())
    const html = makePreviewDocument(artifact, 'index', 'channel-123')
    const document: any = parse(html)
    const head = document.childNodes.find((n: any) => n.tagName === 'html').childNodes.find((n: any) => n.tagName === 'head')
    const policy = head.childNodes.find((n: any) => n.tagName === 'meta' && n.attrs.some((a: any) => a.name === 'http-equiv'))
      .attrs.find((a: any) => a.name === 'content').value
    expect(policy).toContain("connect-src 'none'")
    expect(policy).toContain("base-uri 'none'")
    expect(html).toContain('channel-123')
    expect(html).not.toContain('src="website.js"')
    expect(html).not.toContain('allow-same-origin')
    expect(() => makePreviewDocument(artifact, 'https://bad.example', 'x')).toThrow(WebsiteArtifactError)
  })
  it('export_rejects_tampered_artifact_hash', async () => {
    const artifact = compileWebsiteArtifact(draft())
    artifact.files[0].content = '<script>evil()</script>'
    await expect(exportWebsiteZip(artifact)).rejects.toThrow(WebsiteArtifactError)
    expect(() => makePreviewDocument(artifact, 'index', 'x')).toThrow(WebsiteArtifactError)
  })
})

describe('compact multi-page packages', () => {
  it('shares a single stylesheet across all pages and retains page overrides', () => {
    const input = draft()
    const shared = 'body{background:#0e0e0e;color:#eee}'
    const artifact = compileWebsiteArtifact({...input, css: shared})
    expect(artifact.pages).toHaveLength(2)
    for (const page of artifact.pages) expect(page.html).toContain(shared)
    expect(artifact.pages[0].html.indexOf(shared)).toBeLessThan(artifact.pages[0].html.indexOf(input.pages[0].css))
  })
  it('accepts pages without duplicate per-page styles in a shared-style package', () => {
    const input = {...draft(), css: 'body{color:gold}'}
    const pages = input.pages.map(({css: _css, ...page}) => page)
    const artifact = compileWebsiteArtifact({...input, pages})
    expect(artifact.pages.map(p=>p.key)).toEqual(['index','about'])
    expect(artifact.pages[1].html).toContain('body{color:gold}')
  })
  it('rejects non-text shared styles and still rejects hostile markup', () => {
    expect(()=>compileWebsiteArtifact({...draft(),css:{bad:true}})).toThrow(WebsiteArtifactError)
    expect(()=>compileWebsiteArtifact({...draft('<script>alert(1)</script>'),css:''})).toThrow(WebsiteArtifactError)
  })
})

describe('approved home page aliases',()=>{
 it('exports a plan named home as index and rewrites only its internal page links',async()=>{
  const input=draft('<h1 id="top">Lumvy</h1><a href="about.html">Om oss</a>')
  input.pages[0].key='home'
  input.pages[1].bodyHtml='<h1>Om oss</h1><a href="home.html#top">Hem</a>'
  const artifact=compileWebsiteArtifact(input)
  expect(artifact.pages.map(p=>p.key)).toEqual(['index','about'])
  expect(artifact.pages[1].html).toContain('href="index.html#top"')
  const zip=await JSZip.loadAsync(await exportWebsiteZip(artifact))
  expect(await zip.file('index.html')!.async('string')).toContain('Lumvy')
 })
 it('keeps home as a distinct page when the package already has index',()=>{
  const input=draft()
  input.pages.push({key:'home',title:'Extra sida',bodyHtml:'<a href="home.html">Extra</a>',css:'',behaviors:[]})
  const artifact=compileWebsiteArtifact(input)
  expect(artifact.pages.map(p=>p.key)).toEqual(['index','about','home'])
  expect(artifact.pages[2].html).toContain('href="home.html"')
 })
})

describe('canonical internal website links',()=>{
 it.each([['/','index.html'],['/about','about.html'],['about','about.html'],['/about.html','about.html'],['/about#team','about.html#team']])('maps known internal route %s to the exported page', (href,expected)=>{
  const artifact=compileWebsiteArtifact(draft('<a href="'+href+'">Länk</a>'))
  expect(artifact.pages[0].html).toContain('href="'+expected+'"')
 })
 it('keeps the empty fragment as a native same-page top link',()=>{
  expect(compileWebsiteArtifact(draft('<a href="#">Till toppen</a>')).pages[0].html).toContain('href="#"')
 })
 it('normalizes home aliases without confusing a distinct home page',()=>{
  const input=draft('<a href="/home">Hem</a>');input.pages[0].key='home'
  expect(compileWebsiteArtifact(input).pages[0].html).toContain('href="index.html"')
  input.pages[0].key='index';input.pages.push({key:'home',title:'Extra',bodyHtml:'<p>Extra</p>',css:'',behaviors:[]})
  expect(compileWebsiteArtifact(input).pages[0].html).toContain('href="home.html"')
 })
 it.each(['//bad.example','/../about','/%2e%2e/about','/about?token=private','mailto:secret@example.com','javascript:alert(1)','/missing','/about/extra','/about\\evil','&#x2f;&#x2f;bad.example'])('still rejects unsafe or unknown target %s',href=>{
  expect(()=>compileWebsiteArtifact(draft('<a href="'+href+'">Länk</a>'))).toThrow(WebsiteArtifactError)
 })
 it('reports the page, anchor position and a safe reason without echoing URL secrets',()=>{
  try{compileWebsiteArtifact(draft('<a href="about.html">OK</a><a href="https://user:SECRET@example.com/?token=SECRET">Extern</a>'));throw Error('expected validation rejection')}
  catch(error){
   expect(error).toBeInstanceOf(WebsiteArtifactError)
   expect((error as Error).message).toContain('index')
   expect((error as Error).message).toContain('länk 2')
   expect((error as Error).message).not.toContain('SECRET')
   expect((error as WebsiteArtifactError).code).toBe('INVALID_LINK')
  }
 })
})
