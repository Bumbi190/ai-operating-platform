/**
 * pdfTemplate.ts
 *
 * Saga-PDF för Nova & Pling — matchar Juni-månaden stil exakt.
 * Layout: full-bleed Pixar-illustration, kremfärgad textbox overlay nedtill.
 * Format: A4 portrait, marginlöst.
 */

import type { ParsedSaga } from './sagaParser'

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Färga Nova → rosa, Pling → blå i sagatexten */
function colorNames(text: string): string {
  return esc(text)
    .replace(/\bNova\b/g, '<span class="name-nova">Nova</span>')
    .replace(/\bPling\b/g, '<span class="name-pling">Pling</span>')
}

export function buildPdfHtml(saga: ParsedSaga, imageUrls: string[] = []): string {
  const pages = saga.pages.length > 0
    ? saga.pages
    : Array.from({ length: 16 }, (_, i) => ({ number: i + 1, illustrationDesc: '', text: '…' }))

  // ── Cover ─────────────────────────────────────────────────────────────────
  const coverImg = imageUrls[0] ?? null
  const coverPage = `
<div class="page cover-page">
  ${coverImg
    ? `<img class="cover-bg" src="${esc(coverImg)}" alt="Omslag"/>`
    : `<div class="cover-bg cover-bg-fallback"></div>`}
  <div class="cover-overlay">
    <div class="cover-badge">✨ SAGAN ✨</div>
    <h1 class="cover-title">${esc(saga.title)}</h1>
    <p class="cover-sub">${esc(saga.subtitle)}</p>
  </div>
</div>`

  // ── Story pages ────────────────────────────────────────────────────────────
  // Cover takes imageUrls[0]. Story pages start at imageUrls[1] so cover is never reused.
  const storyImageCount = imageUrls.length

  // Themed corner decorations — pair of emojis matching the story mood
  // Rotated through a set so consecutive pages feel varied but thematically consistent
  const CORNER_PAIRS = [
    ['✨', '🌟'], ['🍃', '🌸'], ['⭐', '💫'], ['🌙', '✨'],
    ['🦋', '🌺'], ['🍎', '🌿'], ['🌈', '☀️'], ['🐚', '🌊'],
  ]

  const pageBlocks = pages.map((page, i) => {
    const imgIdx = storyImageCount > 1 ? Math.min(i + 1, storyImageCount - 1) : 0
    const imgUrl = storyImageCount > 0 ? imageUrls[imgIdx] : null
    const [cornerL, cornerR] = CORNER_PAIRS[i % CORNER_PAIRS.length]

    return `
<div class="page story-page">
  ${imgUrl
    ? `<img class="story-bg" src="${esc(imgUrl)}" alt="Illustration sida ${page.number}"/>`
    : `<div class="story-bg story-bg-fallback">
        <div class="placeholder-inner">
          <p class="placeholder-desc">${esc(page.illustrationDesc || 'Nova & Pling i äventyret')}</p>
        </div>
      </div>`}
  <div class="text-box">
    <span class="text-box-corner-left">${cornerL}</span>
    <span class="text-box-corner-right">${cornerR}</span>
    <p class="story-text">${colorNames(page.text || '…')}</p>
  </div>
</div>`
  }).join('\n')

  // ── Back cover ─────────────────────────────────────────────────────────────
  // Back cover: prefer a middle image that hasn't been used as cover (index 0) or last story page.
  // With 16 images: cover=0, story pages use 1–15. Back uses index 0 again (cover) — different context, OK.
  // Or use a dedicated mid-point image to vary the look.
  const backImgIdx = imageUrls.length > 2 ? Math.floor(imageUrls.length / 2) : 0
  const backImg = imageUrls.length > 0 ? imageUrls[backImgIdx] : null
  const backPage = `
<div class="page back-page">
  ${backImg
    ? `<img class="cover-bg" src="${esc(backImg)}" alt="Baksida"/>`
    : `<div class="cover-bg cover-bg-back"></div>`}
  <div class="back-overlay">
    <div class="back-moral-label">🌟 Månadens lärdom</div>
    <p class="back-moral">${esc(saga.sensmoralen || 'Nova & Pling är redo för nästa äventyr!')}</p>
    ${saga.quote ? `<p class="back-quote">"${esc(saga.quote)}"<br><span class="back-quote-author">— Nova</span></p>` : ''}
    <div class="back-logo">Familje-Stunden · Nova &amp; Pling</div>
  </div>
</div>`

  return `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(saga.title)} — Familje-Stunden</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  @media print {
    .no-print { display: none !important; }
    .page { page-break-after: always; box-shadow: none; border-radius: 0; margin: 0; }
    .page:last-child { page-break-after: avoid; }
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #f0f0f0; font-family: Georgia, 'Times New Roman', serif; }

  /* ── Toolbar ── */
  .no-print { position: fixed; top: 1.5rem; right: 1.5rem; z-index: 100; display: flex; gap: .5rem; flex-direction: column; align-items: flex-end; }
  .btn { display: inline-flex; align-items: center; gap: .5rem; padding: .55rem 1.1rem; border-radius: .5rem; font-family: Arial, sans-serif; font-size: .82rem; font-weight: 600; cursor: pointer; border: none; text-decoration: none; white-space: nowrap; }
  .btn-print { background: #e91e8c; color: #fff; }
  .btn-back  { background: #e5e7eb; color: #374151; font-size: .73rem; padding: .4rem .85rem; }

  /* ── Base page ── */
  .page {
    position: relative;
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto 2rem;
    overflow: hidden;
    box-shadow: 0 6px 32px rgba(0,0,0,.18);
    background: #fff;
  }

  /* ── Cover ── */
  .cover-page { display: flex; flex-direction: column; }
  .cover-bg {
    position: absolute; inset: 0;
    width: 100%; height: 100%;
    object-fit: cover;
  }
  .cover-bg-fallback {
    position: absolute; inset: 0;
    background: linear-gradient(160deg, #1a6bc4 0%, #0d3b8c 50%, #1a1035 100%);
  }
  .cover-bg-back {
    position: absolute; inset: 0;
    background: linear-gradient(160deg, #f59e0b 0%, #f97316 50%, #dc2626 100%);
  }
  .cover-overlay {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    background: linear-gradient(to top, rgba(0,0,0,.75) 0%, rgba(0,0,0,.4) 60%, transparent 100%);
    padding: 3rem 3rem 2.5rem;
    text-align: center;
    display: flex; flex-direction: column; align-items: center; gap: .75rem;
  }
  .cover-badge {
    background: #fbbf24;
    color: #7c2d12;
    font-family: Arial, sans-serif;
    font-size: .75rem;
    font-weight: 800;
    letter-spacing: .2em;
    text-transform: uppercase;
    padding: .3rem 1.2rem;
    border-radius: 999px;
  }
  .cover-title {
    font-size: 2.8rem;
    font-weight: 900;
    color: #fff;
    text-shadow: 3px 3px 0 #e91e8c, 0 0 30px rgba(233,30,140,.5);
    line-height: 1.15;
  }
  .cover-sub {
    font-size: 1rem;
    color: #fde68a;
    font-style: italic;
  }

  /* ── Story page ── */
  .story-page { }
  .story-bg {
    position: absolute; inset: 0;
    width: 100%; height: 100%;
    object-fit: cover;
  }
  .story-bg-fallback {
    position: absolute; inset: 0;
    background: linear-gradient(135deg, #bfdbfe 0%, #ddd6fe 100%);
    display: flex; align-items: center; justify-content: center;
  }
  .placeholder-inner {
    border: 3px dashed #7c3aed;
    border-radius: 1rem;
    margin: 2rem;
    padding: 2rem;
    width: calc(100% - 4rem);
    height: calc(100% - 4rem);
    display: flex; align-items: center; justify-content: center;
  }
  .placeholder-desc {
    font-style: italic; color: #4c1d95;
    font-size: .9rem; text-align: center; line-height: 1.6;
  }

  /* Text box — floating cream box matching Juni reference exactly */
  .text-box {
    position: absolute;
    bottom: 1.2rem;
    left: 1.3rem;
    right: 1.3rem;
    background: rgba(255, 254, 247, 0.97);
    border: 2.5px solid #f9c06a;
    border-radius: 1.5rem;
    padding: 1.1rem 2rem 1.6rem;
    min-height: 5.5rem;
    text-align: center;
    box-shadow: 0 8px 32px rgba(0,0,0,.22);
  }
  /* Gradient fade at very top of box blending into illustration */
  .text-box::after {
    content: '';
    position: absolute;
    top: -1.5rem;
    left: 0; right: 0;
    height: 1.5rem;
    background: linear-gradient(to bottom, transparent, rgba(255,254,247,0.0));
    pointer-events: none;
  }
  /* Inner dashed decorative ring */
  .text-box::before {
    content: '';
    position: absolute;
    inset: 5px;
    border: 1.5px dashed rgba(233,30,140,0.28);
    border-radius: 1.1rem;
    pointer-events: none;
  }
  /* Decorative corner emojis rendered via data attributes in each page */
  .text-box-corner-left {
    position: absolute;
    bottom: 0.5rem;
    left: 0.9rem;
    font-size: 1.15rem;
    line-height: 1;
  }
  .text-box-corner-right {
    position: absolute;
    bottom: 0.5rem;
    right: 0.9rem;
    font-size: 1.15rem;
    line-height: 1;
  }
  .story-text {
    font-size: 1.08rem;
    line-height: 1.85;
    color: #2d1a5e;
    font-family: Georgia, serif;
    font-style: italic;
  }
  .name-nova  { color: #e91e8c; font-weight: 700; }
  .name-pling { color: #1d6fe8; font-weight: 700; }

  /* ── Back cover ── */
  .back-page { }
  .back-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, rgba(0,0,0,.2) 0%, rgba(0,0,0,.7) 100%);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    text-align: center;
    padding: 3rem;
    gap: 1.2rem;
  }
  .back-moral-label {
    font-family: Arial, sans-serif;
    font-size: .7rem;
    letter-spacing: .25em;
    text-transform: uppercase;
    color: #fbbf24;
    background: rgba(0,0,0,.4);
    padding: .3rem 1rem;
    border-radius: 999px;
  }
  .back-moral {
    font-size: 1.6rem;
    font-weight: bold;
    color: #fff;
    line-height: 1.4;
    max-width: 80%;
    text-shadow: 0 2px 12px rgba(0,0,0,.5);
  }
  .back-quote {
    font-style: italic;
    color: #fde68a;
    font-size: 1rem;
    line-height: 1.6;
    max-width: 75%;
  }
  .back-quote-author { color: #fbbf24; font-weight: 700; font-style: normal; }
  .back-logo {
    font-family: Arial, sans-serif;
    font-size: .65rem;
    letter-spacing: .3em;
    text-transform: uppercase;
    color: rgba(255,255,255,.4);
    margin-top: 1rem;
  }
</style>
</head>
<body>

<div class="no-print">
  <button class="btn btn-print" onclick="window.print()">🖨️ Spara som PDF</button>
  <a class="btn btn-back" href="javascript:history.back()">← Tillbaka</a>
</div>

${coverPage}
${pageBlocks}
${backPage}

</body>
</html>`
}
