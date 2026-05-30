/**
 * epubBuilder.ts
 *
 * Bygger en EPUB 3.0-fil från en ParsedSaga.
 * Layout: illustration fyller ~72% av skärmen, textremsa nedtill (mörk bakgrund).
 * Om imageUrls skickas embeddar vi dem som illustrationer.
 * Returnerar en Buffer (ZIP) redo att skickas som fil.
 */

import JSZip from 'jszip'
import type { ParsedSaga } from './sagaParser'

const GOLD    = '#fbbf24'
const ACCENT  = '#7c3aed'
const ACCENT_LIGHT = '#c4b5fd'
const DARK    = '#1e1b4b'
const MUTED   = '#a78bfa'

const STYLES = `
@charset "UTF-8";
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Georgia, 'Times New Roman', serif; background: white; color: ${DARK}; }

/* ── Cover ─────────────────────────────────────────────────────── */
.cover {
  background: linear-gradient(160deg, #1a1035 0%, #2d1b69 60%, #3730a3 100%);
  min-height: 100vh;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  text-align: center;
  padding: 4rem 3rem;
  gap: 1.5rem;
}
.cover-logo  { font-size: .8rem; letter-spacing: .35em; text-transform: uppercase; color: ${GOLD}; font-family: Arial, sans-serif; }
.cover-title { font-size: 3rem; font-weight: bold; color: #fff; line-height: 1.2; text-shadow: 0 2px 24px rgba(124,58,237,.8); }
.cover-subtitle { font-size: 1.1rem; color: ${ACCENT_LIGHT}; font-style: italic; }
.cover-illus { background: rgba(255,255,255,.07); border: 1px solid rgba(196,181,253,.3); border-radius: 1rem; padding: 1.25rem 1.75rem; max-width: 80%; color: ${MUTED}; font-style: italic; font-size: .88rem; line-height: 1.7; }
.cover-stars { font-size: 1.6rem; letter-spacing: .6rem; }

/* ── Story page ─────────────────────────────────────────────────── */
.page { display: flex; flex-direction: column; min-height: 100vh; }

/* Illustration area — fills ~72 % */
.illus-wrap {
  flex: 0 0 72vh;
  overflow: hidden;
  background: linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%);
  display: flex; align-items: center; justify-content: center;
}
.illus-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }

/* Placeholder when no image */
.illus-placeholder {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: .75rem;
  width: calc(100% - 3rem); height: calc(100% - 3rem);
  border: 3px dashed ${ACCENT}; border-radius: 1rem;
  margin: 1.5rem; padding: 2rem;
}
.illus-placeholder-label { font-family: Arial, sans-serif; font-size: .65rem; text-transform: uppercase; letter-spacing: .18em; color: ${ACCENT}; }
.illus-placeholder-desc  { font-style: italic; color: #4c1d95; font-size: .88rem; text-align: center; line-height: 1.65; max-width: 75%; }

/* Text strip */
.text-strip {
  flex: 1;
  background: #1e1b4b;
  padding: 1.4rem 2.2rem 1.4rem 2.6rem;
  display: flex; align-items: flex-start; gap: 1.25rem;
}
.page-num {
  font-family: Arial, sans-serif; font-size: .65rem; font-weight: 700;
  color: ${GOLD}; letter-spacing: .1em;
  background: rgba(124,58,237,.5); border-radius: 999px;
  padding: .25rem .65rem; white-space: nowrap;
  margin-top: .2rem; flex-shrink: 0;
}
.story-text { font-size: 1.15rem; line-height: 1.75; color: #f3f0ff; }

/* ── Back cover ─────────────────────────────────────────────────── */
.back-cover {
  background: linear-gradient(160deg, #1a1035 0%, #2d1b69 100%);
  min-height: 100vh;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  text-align: center;
  padding: 4rem 3rem; gap: 1.25rem;
}
.back-illus        { font-style: italic; color: ${MUTED}; font-size: .9rem; }
.sensmoralen-label { font-size: .68rem; letter-spacing: .22em; text-transform: uppercase; color: ${GOLD}; font-family: Arial, sans-serif; }
.sensmoralen       { font-size: 1.5rem; font-weight: bold; color: #fff; line-height: 1.5; max-width: 80%; }
.back-quote        { font-style: italic; color: ${ACCENT_LIGHT}; font-size: .95rem; }
.back-quote-author { color: ${GOLD}; font-size: .8rem; }
.back-logo         { margin-top: 2rem; font-size: .7rem; letter-spacing: .3em; text-transform: uppercase; color: rgba(196,181,253,.4); font-family: Arial, sans-serif; }
`.trim()

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function coverHtml(saga: ParsedSaga): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="sv">
<head><meta charset="UTF-8"/><title>${escapeXml(saga.title)}</title><link rel="stylesheet" type="text/css" href="../styles/book.css"/></head>
<body>
<div class="cover">
  <div class="cover-logo">Familje-Stunden</div>
  <h1 class="cover-title">${escapeXml(saga.title)}</h1>
  <p class="cover-subtitle">${escapeXml(saga.subtitle)}</p>
  ${saga.coverIllustrationDesc ? `<div class="cover-illus"><em>${escapeXml(saga.coverIllustrationDesc)}</em></div>` : ''}
  <div class="cover-stars">⭐ 🚀 ✨</div>
</div>
</body>
</html>`
}

function pageHtml(
  page: { number: number; illustrationDesc: string; text: string },
  title: string,
  imageFile: string | null,
): string {
  const illustrationBlock = imageFile
    ? `<div class="illus-wrap"><img src="../images/${imageFile}" alt="Illustration sida ${page.number}"/></div>`
    : `<div class="illus-wrap">
        <div class="illus-placeholder">
          <div class="illus-placeholder-label">🎨 Illustration</div>
          <p class="illus-placeholder-desc">${page.illustrationDesc ? escapeXml(page.illustrationDesc) : 'Nova &amp; Pling i äventyret'}</p>
        </div>
      </div>`

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="sv">
<head><meta charset="UTF-8"/><title>${escapeXml(title)} — Sida ${page.number}</title><link rel="stylesheet" type="text/css" href="../styles/book.css"/></head>
<body>
<div class="page">
  ${illustrationBlock}
  <div class="text-strip">
    <span class="page-num">${page.number}</span>
    <p class="story-text">${escapeXml(page.text || '…')}</p>
  </div>
</div>
</body>
</html>`
}

function backCoverHtml(saga: ParsedSaga): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="sv">
<head><meta charset="UTF-8"/><title>Baksida</title><link rel="stylesheet" type="text/css" href="../styles/book.css"/></head>
<body>
<div class="back-cover">
  ${saga.backCoverIllustrationDesc ? `<p class="back-illus">✨ ${escapeXml(saga.backCoverIllustrationDesc)}</p>` : ''}
  <div class="sensmoralen-label">Månadens lärdom</div>
  <p class="sensmoralen">${escapeXml(saga.sensmoralen || 'Nova &amp; Pling är redo för nästa äventyr!')}</p>
  ${saga.quote ? `<p class="back-quote">"${escapeXml(saga.quote)}"</p><p class="back-quote-author">— Nova</p>` : ''}
  <div class="back-logo">Familje-Stunden · Nova &amp; Pling</div>
</div>
</body>
</html>`
}

function opf(saga: ParsedSaga, pageCount: number, imageFiles: string[]): string {
  const now = new Date().toISOString().slice(0, 10)
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1)

  const imageManifest = imageFiles.map((f, i) =>
    `<item id="img${i}" href="images/${f}" media-type="image/png"/>`
  )

  const manifestItems = [
    `<item id="cover"  href="text/cover.xhtml"   media-type="application/xhtml+xml"/>`,
    ...pages.map((n) => `<item id="page${n}" href="text/page${n.toString().padStart(2, '0')}.xhtml" media-type="application/xhtml+xml"/>`),
    `<item id="backcov" href="text/backcov.xhtml" media-type="application/xhtml+xml"/>`,
    `<item id="css"   href="styles/book.css"     media-type="text/css"/>`,
    `<item id="nav"   href="nav.xhtml"           media-type="application/xhtml+xml" properties="nav"/>`,
    ...imageManifest,
  ]

  const spineItems = [
    `<itemref idref="cover"/>`,
    ...pages.map((n) => `<itemref idref="page${n}"/>`),
    `<itemref idref="backcov"/>`,
  ]

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">nova-pling-${Date.now()}</dc:identifier>
    <dc:title>${escapeXml(saga.title)}</dc:title>
    <dc:creator>Nova &amp; Pling / Familje-Stunden</dc:creator>
    <dc:language>sv</dc:language>
    <dc:date>${now}</dc:date>
    <dc:description>${escapeXml(saga.subtitle)}</dc:description>
    <meta property="dcterms:modified">${new Date().toISOString().slice(0, 19)}Z</meta>
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine>
    ${spineItems.join('\n    ')}
  </spine>
</package>`
}

function navXhtml(saga: ParsedSaga, pageCount: number): string {
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1)
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="sv">
<head><meta charset="UTF-8"/><title>${escapeXml(saga.title)}</title></head>
<body>
<nav epub:type="toc">
<h1>Innehåll</h1>
<ol>
  <li><a href="text/cover.xhtml">Omslag</a></li>
  ${pages.map((n) => `<li><a href="text/page${n.toString().padStart(2, '0')}.xhtml">Sida ${n}</a></li>`).join('\n  ')}
  <li><a href="text/backcov.xhtml">Baksida</a></li>
</ol>
</nav>
</body>
</html>`
}

async function fetchImage(url: string): Promise<Buffer | null> {
  try {
    // data:image/png;base64,... — avkoda direkt utan nätverksanrop
    if (url.startsWith('data:')) {
      const base64 = url.split(',')[1]
      if (!base64) return null
      return Buffer.from(base64, 'base64')
    }
    const res = await fetch(url)
    if (!res.ok) return null
    const ab = await res.arrayBuffer()
    return Buffer.from(ab)
  } catch {
    return null
  }
}

export async function buildEpub(saga: ParsedSaga, imageUrls: string[] = []): Promise<Buffer> {
  const zip = new JSZip()

  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })

  zip.folder('META-INF')!.file('container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`)

  const oebps  = zip.folder('OEBPS')!
  const text   = oebps.folder('text')!
  const styles = oebps.folder('styles')!
  const images = oebps.folder('images')!

  styles.file('book.css', STYLES)

  // Fetch and embed images
  const embeddedImages: string[] = []
  for (let i = 0; i < imageUrls.length; i++) {
    const buf = await fetchImage(imageUrls[i])
    if (buf) {
      const filename = `image-${i + 1}.png`
      images.file(filename, buf)
      embeddedImages.push(filename)
    }
  }

  text.file('cover.xhtml', coverHtml(saga))

  const pagesToRender = saga.pages.length > 0
    ? saga.pages
    : Array.from({ length: 16 }, (_, i) => ({ number: i + 1, illustrationDesc: '', text: '…' }))

  for (let i = 0; i < pagesToRender.length; i++) {
    const page = pagesToRender[i]
    const imageFile = embeddedImages.length > 0
      ? embeddedImages[i % embeddedImages.length]
      : null
    const filename = `page${page.number.toString().padStart(2, '0')}.xhtml`
    text.file(filename, pageHtml(page, saga.title, imageFile))
  }

  text.file('backcov.xhtml', backCoverHtml(saga))

  oebps.file('content.opf', opf(saga, pagesToRender.length, embeddedImages))
  oebps.file('nav.xhtml',   navXhtml(saga, pagesToRender.length))

  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
}
