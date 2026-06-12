/**
 * monthlyPdfTemplate.ts — JUNI-STIL
 *
 * Komplett månadspaket-PDF för Familje-Stunden.
 * Design: full-bleed illustrationer + overlay-boxar, varma färger.
 * Exakt struktur:
 *   1. Omslag
 *   2. Innehåll
 *   3. Sagosida (med knappar)
 *   4–8. 5 Aktivitetssidor
 *   9–13. 5 Färgläggningsbilder
 *   14. Klipp & Klistra
 *   15. Krysslista
 *   16. Diplom
 *   17. Avslutningssida
 */

interface MonthlyContext {
  tema?: string
  aktiviteter?: string
  saga?: string
  komplement?: string
  bilder?: string           // B&W coloring pages (JSON)
  sagabilder?: string       // Colored saga illustrations (JSON)
  aktivitetsbilder?: string // Activity illustrations (JSON)
  /** Dedicated cover images generated with COVER_ILLUSTRATIONS mode.
   *  omslagsbilder.urls[0] = monthly package cover (title baked in)
   *  omslagsbilder.urls[1] = saga info page cover (saga title baked in)
   */
  omslagsbilder?: string
  /** Dedicated craft/pyssel illustration */
  pysselbilder?: string
  runId: string
  sagaTitle: string
  sagaSubtitle: string
}
// OBS: Referensbilder (omslag.png, innehall.png etc.) används ENBART som stil-guider
// när gpt-image-1 genererar NYA bilder via images.edit() i runner.ts.
// De ska aldrig placeras direkt i PDF:en — PDF:en använder alltid AI-genererade bilder.

// ─── Utilities ────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function parseImageUrls(json: string | undefined): string[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return (parsed.urls ?? []).filter(Boolean) as string[]
  } catch { return [] }
}

/** Minimal markdown → HTML for content boxes */
function mdToHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/^#{1,3}\s+(.+)$/gm, '<strong>$1</strong>')
    .replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>(\n|$))+/g, (m) => `<ul>${m}</ul>`)
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>').replace(/$/, '</p>')
    .replace(/<p><\/p>/g, '')
}

/** Parse aktiviteter markdown into max 5 activity sections */
function parseAktiviteter(text: string): { title: string; content: string }[] {
  const sections: { title: string; content: string }[] = []
  const lines = text.split('\n')
  let current: { title: string; lines: string[] } | null = null

  for (const line of lines) {
    const h = line.match(/^#{2,3}\s+(.+)/)
    if (h) {
      if (current) sections.push({ title: current.title, content: current.lines.join('\n').trim() })
      current = { title: h[1].trim(), lines: [] }
    } else if (current) {
      current.lines.push(line)
    }
  }
  if (current) sections.push({ title: current.title, content: current.lines.join('\n').trim() })

  // Filter out section-header stubs (e.g. "🎯 Aktiviteter", "✂️ Pyssel") that have no real content.
  // These appear as ## headers that contain no sub-items of their own.
  const withContent = sections.filter(s => s.content.replace(/\s/g, '').length > 30)

  return withContent.slice(0, 6) // first 5 = activities, 6th = pyssel if present
}

/** Extract checklist items */
function parseChecklist(text: string): string[] {
  return text
    .split('\n')
    .map(l => l.match(/^[-•✓☐✅]\s*(.+)/) ?? l.match(/^\d+\.\s*(.+)/))
    .filter(Boolean)
    .map(m => m![1].trim())
    .filter(item => {
      if (!item) return false
      // Filtrera bort separatorer som "--", "---", "-", "—"
      if (/^[-–—]+$/.test(item)) return false
      // Filtrera bort rader som är för korta för att vara meningsfulla
      if (item.length < 5) return false
      return true
    })
    .slice(0, 10)
}

// ─── Activity color themes (one per slot) ────────────────────────────────────
const ACTIVITY_THEMES = [
  { bg: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)', accent: '#fbbf24', badge: '#1e3a8a' },
  { bg: 'linear-gradient(135deg, #065f46 0%, #10b981 100%)', accent: '#fde68a', badge: '#064e3b' },
  { bg: 'linear-gradient(135deg, #7c2d12 0%, #f97316 100%)', accent: '#fef3c7', badge: '#7c2d12' },
  { bg: 'linear-gradient(135deg, #831843 0%, #ec4899 100%)', accent: '#fde68a', badge: '#831843' },
  { bg: 'linear-gradient(135deg, #4c1d95 0%, #8b5cf6 100%)', accent: '#fef3c7', badge: '#4c1d95' },
]

// ─── CSS ──────────────────────────────────────────────────────────────────────

const STYLES = `
  @page { size: A4 portrait; margin: 0; }
  @media print {
    .no-print { display: none !important; }
    .no-print-toolbar { display: none !important; }
    .no-print-toolbar-spacer { display: none !important; }
    .toolbar-spacer { display: none !important; }
    .page { page-break-after: always; box-shadow: none; border-radius: 0; margin: 0; width: 210mm; min-height: 297mm; }
    .page:last-child { page-break-after: avoid; }
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Georgia, 'Times New Roman', serif; background: #e5e7eb; }

  /* Toolbar */
  /* Toolbar */
  .no-print-toolbar {
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 1000;
    background: #111827;
    border-bottom: 1px solid #374151;
    padding: .65rem 1.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    font-family: Arial, sans-serif;
    box-shadow: 0 2px 12px rgba(0,0,0,.4);
  }
  .toolbar-title {
    font-size: .82rem;
    font-weight: 700;
    color: #f9fafb;
    letter-spacing: .02em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .toolbar-hint {
    font-size: .73rem;
    color: #9ca3af;
    white-space: nowrap;
  }
  .toolbar-actions { display: flex; align-items: center; gap: .5rem; flex-shrink: 0; }
  .btn { display: inline-flex; align-items: center; gap: .45rem; padding: .5rem 1rem; border-radius: .45rem; font-family: Arial, sans-serif; font-size: .8rem; font-weight: 600; cursor: pointer; border: none; text-decoration: none; white-space: nowrap; }
  .btn-print { background: #e91e8c; color: #fff; }
  .btn-print:hover { background: #c2185b; }
  .btn-download { background: #374151; color: #f9fafb; }
  .btn-download:hover { background: #4b5563; }
  .btn-back { background: #1f2937; color: #9ca3af; font-size: .75rem; padding: .4rem .85rem; border: 1px solid #374151; }
  .btn-back:hover { color: #f9fafb; }
  .toolbar-spacer { height: 52px; }
  @media (max-width: 600px) { .toolbar-title { display: none; } .toolbar-hint { display: none; } }

  /* Base page */
  .page {
    position: relative;
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto 2rem;
    overflow: hidden;
    box-shadow: 0 6px 32px rgba(0,0,0,.18);
    background: #fff;
  }

  /* Full-bleed background image helper */
  .page-bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .page-bg-gradient {
    position: absolute;
    inset: 0;
  }

  /* ── COVER ───────────────────────────────────────────────────────── */
  .cover-overlay {
    position: absolute;
    inset: 0;
    /* Gradient only at top to make title readable — bottom stays clear for characters */
    background: linear-gradient(to bottom, rgba(0,0,0,.52) 0%, rgba(0,0,0,.18) 30%, transparent 55%);
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
    text-align: center;
    padding: 2.2rem 2rem 3rem;
    gap: 0.55rem;
  }
  .cover-eyebrow {
    font-family: Arial, sans-serif;
    font-size: .68rem;
    letter-spacing: .22em;
    text-transform: uppercase;
    color: #fff;
    background: rgba(233,30,140,.75);
    padding: .3rem 1.2rem;
    border-radius: 999px;
    box-shadow: 0 2px 8px rgba(0,0,0,.35);
  }
  .cover-title {
    font-family: 'Arial Black', Arial, sans-serif;
    font-size: 3.8rem;
    font-weight: 900;
    color: #fbbf24;
    line-height: 1.0;
    /* Bold dark outline for depth like Juni reference */
    text-shadow:
      3px  3px 0 #92400e,
     -1px -1px 0 #92400e,
      1px -1px 0 #92400e,
     -1px  1px 0 #92400e,
      0 4px 18px rgba(0,0,0,.5);
    letter-spacing: -1px;
  }
  .cover-subtitle {
    background: rgba(233,30,140,.82);
    color: #fff;
    font-family: 'Arial Black', Arial, sans-serif;
    font-size: .82rem;
    font-weight: 900;
    letter-spacing: .08em;
    padding: .32rem 1.4rem;
    border-radius: 999px;
    box-shadow: 0 2px 10px rgba(0,0,0,.3);
  }
  .cover-tagline {
    font-family: Georgia, serif;
    font-size: .88rem;
    color: rgba(255,255,255,.95);
    font-style: italic;
    text-shadow: 0 1px 6px rgba(0,0,0,.6);
    margin-top: .1rem;
  }
  .cover-logo {
    position: absolute;
    bottom: 1.2rem;
    font-family: Arial, sans-serif;
    font-size: .58rem;
    letter-spacing: .35em;
    text-transform: uppercase;
    color: rgba(255,255,255,.45);
  }

  /* ── CONTENTS ────────────────────────────────────────────────────── */
  .contents-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, rgba(255,255,255,.95) 0%, rgba(255,255,255,.9) 100%);
    display: flex;
    flex-direction: column;
    padding: 3.5rem 4rem;
  }
  .contents-title {
    font-size: 2.4rem;
    font-weight: 900;
    color: #1e1b4b;
    margin-bottom: .5rem;
    text-shadow: 2px 2px 0 rgba(233,30,140,.2);
  }
  .contents-subtitle {
    font-size: .95rem;
    color: #6b7280;
    font-style: italic;
    margin-bottom: 2rem;
  }
  .contents-grid {
    display: flex;
    flex-direction: column;
    gap: .75rem;
    flex: 1;
  }
  .contents-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    background: rgba(255,255,255,.8);
    border-radius: .75rem;
    padding: .75rem 1.2rem;
    border-left: 4px solid #e91e8c;
    box-shadow: 0 1px 4px rgba(0,0,0,.08);
  }
  .contents-row .c-icon { font-size: 1.5rem; flex-shrink: 0; }
  .contents-row .c-label { flex: 1; font-size: .95rem; color: #1f2937; font-weight: 600; }
  .contents-row .c-page { font-family: Arial, sans-serif; font-size: .8rem; color: #e91e8c; font-weight: 700; }

  /* ── SAGA INFO PAGE ───────────────────────────────────────────────── */
  .saga-info-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(0,0,0,.85) 0%, rgba(0,0,0,.35) 60%, transparent 100%);
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 3rem;
    gap: 1rem;
  }
  .saga-info-badge {
    font-family: Arial, sans-serif;
    font-size: .65rem;
    letter-spacing: .25em;
    text-transform: uppercase;
    color: #fbbf24;
    background: rgba(0,0,0,.5);
    padding: .3rem .9rem;
    border-radius: 999px;
    display: inline-block;
    align-self: flex-start;
  }
  .saga-info-title { font-size: 2rem; font-weight: 900; color: #fff; line-height: 1.2; text-shadow: 0 2px 12px rgba(0,0,0,.6); }
  .saga-info-sub { font-size: 1rem; color: #fde68a; font-style: italic; }
  .saga-btns { display: flex; gap: 1rem; flex-wrap: wrap; margin-top: .5rem; }
  .saga-btn { padding: .75rem 1.6rem; border-radius: .6rem; font-family: Arial, sans-serif; font-size: .9rem; font-weight: 800; text-decoration: none; color: #fff; box-shadow: 0 2px 12px rgba(0,0,0,.4); }

  /* ── ACTIVITY PAGES ───────────────────────────────────────────────── */
  .activity-content-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    /* Gradient som bär texten — tonar ut mot botten av bilden */
    background: linear-gradient(
      to bottom,
      transparent 0%,
      transparent 40%,
      rgba(0,0,0,.25) 60%,
      rgba(0,0,0,.72) 80%,
      rgba(0,0,0,.88) 100%
    );
  }
  .activity-badge {
    font-family: Arial, sans-serif;
    font-size: .6rem;
    letter-spacing: .25em;
    text-transform: uppercase;
    font-weight: 800;
    padding: .28rem .85rem;
    border-radius: 999px;
    display: inline-block;
    align-self: flex-start;
    margin: 0 2rem .4rem;
  }
  .activity-title-box {
    padding: 0 2rem .35rem;
  }
  .activity-title-box h2 {
    font-size: 1.7rem;
    font-weight: 900;
    line-height: 1.15;
    color: #fff;
    text-shadow: 0 2px 12px rgba(0,0,0,.6);
    margin: 0;
  }
  .activity-main-box {
    padding: .5rem 2rem 2rem;
    display: flex;
    flex-direction: column;
    gap: .55rem;
  }
  .activity-section-label {
    font-family: Arial, sans-serif;
    font-size: .6rem;
    letter-spacing: .2em;
    text-transform: uppercase;
    font-weight: 700;
    color: rgba(255,255,255,.6);
    margin-bottom: .1rem;
  }
  .activity-main-box p,
  .activity-main-box li { font-size: .9rem; line-height: 1.65; color: rgba(255,255,255,.92); }
  .activity-main-box ul { padding-left: 1.2rem; }
  .activity-main-box strong { font-weight: 700; color: #fff; }

  /* ── COLORING PAGES ───────────────────────────────────────────────── */
  .coloring-label {
    position: absolute;
    bottom: 1rem;
    right: 1.5rem;
    font-family: Arial, sans-serif;
    font-size: .6rem;
    letter-spacing: .2em;
    text-transform: uppercase;
    color: #9ca3af;
  }
  .coloring-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    border: 3px dashed #d1d5db;
    margin: 3rem;
    border-radius: 1rem;
  }
  .coloring-placeholder span { font-size: 3rem; }
  .coloring-placeholder p { font-style: italic; color: #9ca3af; font-size: .9rem; text-align: center; }

  /* ── CRAFT PAGE ───────────────────────────────────────────────────── */
  .craft-overlay {
    position: absolute;
    inset: 0;
    background: rgba(255, 251, 235, 0.94);
    display: flex;
    flex-direction: column;
    padding: 3rem 3.5rem;
    gap: .75rem;
  }
  .craft-eyebrow {
    background: #f59e0b;
    color: #78350f;
    font-family: Arial, sans-serif;
    font-size: .65rem;
    font-weight: 800;
    letter-spacing: .2em;
    text-transform: uppercase;
    padding: .35rem 1rem;
    border-radius: 999px;
    display: inline-block;
    align-self: flex-start;
    margin-bottom: .5rem;
  }
  .craft-overlay h1 { font-size: 2rem; font-weight: 900; color: #92400e; line-height: 1.2; margin-bottom: .5rem; }
  .craft-overlay h2 { font-size: 1rem; color: #78350f; margin: .75rem 0 .3rem; font-family: Arial, sans-serif; letter-spacing: .05em; }
  .craft-overlay p, .craft-overlay li { font-size: .9rem; line-height: 1.7; color: #374151; }
  .craft-overlay ul, .craft-overlay ol { padding-left: 1.4rem; }
  .craft-overlay strong { color: #92400e; font-weight: 700; }

  /* ── CHECKLIST PAGE ───────────────────────────────────────────────── */
  .checklist-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, rgba(0,0,0,.6) 0%, rgba(0,0,0,.75) 100%);
    display: flex;
    flex-direction: column;
    padding: 3.5rem 4rem;
  }
  .checklist-eyebrow {
    background: #22c55e;
    color: #fff;
    font-family: Arial, sans-serif;
    font-size: .65rem;
    font-weight: 800;
    letter-spacing: .2em;
    text-transform: uppercase;
    padding: .35rem 1rem;
    border-radius: 999px;
    display: inline-block;
    align-self: flex-start;
    margin-bottom: 1rem;
  }
  .checklist-overlay h1 { font-size: 2.2rem; font-weight: 900; color: #fff; margin-bottom: .4rem; text-shadow: 0 2px 8px rgba(0,0,0,.5); }
  .checklist-overlay > p { font-size: .9rem; color: rgba(255,255,255,.75); font-style: italic; margin-bottom: 1.5rem; }
  .check-items { display: flex; flex-direction: column; gap: .75rem; flex: 1; }
  .check-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    background: rgba(255,255,255,.92);
    border-radius: .75rem;
    padding: .85rem 1.2rem;
    border-left: 4px solid #22c55e;
    box-shadow: 0 2px 8px rgba(0,0,0,.2);
  }
  .check-box {
    width: 1.5rem;
    height: 1.5rem;
    border: 2.5px solid #22c55e;
    border-radius: .35rem;
    flex-shrink: 0;
  }
  .check-text { font-size: .9rem; color: #1f2937; line-height: 1.5; }

  /* ── DIPLOMA PAGE ─────────────────────────────────────────────────── */
  .diploma-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, rgba(0,0,0,.45) 0%, rgba(0,0,0,.7) 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem;
    text-align: center;
  }
  .diploma-card {
    border: 4px solid rgba(251,191,36,.9);
    border-radius: 2rem;
    padding: 3rem 4rem;
    background: rgba(255,252,235,.88);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.2rem;
    width: 100%;
    box-shadow: 0 8px 40px rgba(0,0,0,.4);
  }
  .diploma-eyebrow {
    font-family: Arial, sans-serif;
    font-size: .65rem;
    letter-spacing: .3em;
    text-transform: uppercase;
    color: #d97706;
  }
  .diploma-title { font-size: 2.6rem; font-weight: 900; color: #92400e; }
  .diploma-stars { font-size: 2rem; letter-spacing: .6rem; }
  .diploma-desc { font-size: 1rem; color: #78350f; }
  .diploma-name-line { border-bottom: 2.5px solid #f59e0b; width: 70%; min-height: 2.5rem; }
  .diploma-achievement { font-size: 1rem; color: #92400e; line-height: 1.6; max-width: 80%; font-style: italic; }
  .diploma-congrats { font-size: 1.3rem; font-weight: 900; color: #e91e8c; }
  .diploma-footer { font-family: Arial, sans-serif; font-size: .6rem; letter-spacing: .25em; text-transform: uppercase; color: #d97706; opacity: .5; margin-top: .5rem; }

  /* ── CLOSING PAGE ─────────────────────────────────────────────────── */
  .closing-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(0,0,0,.8) 0%, rgba(0,0,0,.3) 60%, transparent 100%);
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
    text-align: center;
    padding: 4rem 3rem;
    gap: 1rem;
  }
  .closing-card {
    background: rgba(255,252,240,.92);
    border-radius: 1.5rem;
    padding: 2rem 2.5rem;
    max-width: 85%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: .75rem;
    box-shadow: 0 4px 30px rgba(0,0,0,.2);
  }
  .closing-card h2 { font-size: 1.8rem; font-weight: 900; color: #1e1b4b; }
  .closing-card p { font-size: .95rem; color: #374151; line-height: 1.65; }
  .closing-card .next-teaser { font-size: 1rem; font-weight: 700; color: #e91e8c; }
  .closing-logo { font-family: Arial, sans-serif; font-size: .55rem; letter-spacing: .3em; text-transform: uppercase; color: rgba(255,255,255,.3); }
`

// ─── Page builders ────────────────────────────────────────────────────────────

function buildCoverPage(ctx: MonthlyContext, bgUrl: string, hasBakedTitle = false): string {
  // Split title into up to two lines for the big Juni-style top display (only used when no baked title)
  const titleWords = ctx.sagaTitle.split(' ')
  const mid = Math.ceil(titleWords.length / 2)
  const titleLine1 = titleWords.slice(0, mid).join(' ')
  const titleLine2 = titleWords.slice(mid).join(' ')

  if (hasBakedTitle && bgUrl) {
    // Dedicated cover image — title text already baked in by gpt-image-1.
    // Show only a subtle branding badge at top and a tiny logo at bottom.
    return `
<div class="page">
  <img class="page-bg" src="${esc(bgUrl)}" alt="Omslag"/>
  <div style="position:absolute;top:1.2rem;left:50%;transform:translateX(-50%);z-index:2;">
    <span style="font-family:Arial,sans-serif;font-size:.65rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#fff;background:rgba(233,30,140,.8);padding:.28rem 1.1rem;border-radius:999px;box-shadow:0 2px 8px rgba(0,0,0,.4);white-space:nowrap;">✨ Familje-Stunden · Månadspaket ✨</span>
  </div>
  <div style="position:absolute;bottom:1rem;left:50%;transform:translateX(-50%);font-family:Arial,sans-serif;font-size:.55rem;letter-spacing:.3em;text-transform:uppercase;color:rgba(255,255,255,.5);white-space:nowrap;">Nova &amp; Pling · Familje-Stunden</div>
</div>`
  }

  return `
<div class="page">
  ${bgUrl
    ? `<img class="page-bg" src="${esc(bgUrl)}" alt="Omslag"/>`
    : `<div class="page-bg" style="background:linear-gradient(160deg,#1a1035 0%,#2d1b69 60%,#3730a3 100%);"></div>`}
  <div class="cover-overlay">
    <span class="cover-eyebrow">✨ Familje-Stunden · Månadspaket ✨</span>
    <h1 class="cover-title">${esc(titleLine1)}${titleLine2 ? `<br>${esc(titleLine2)}` : ''}</h1>
    <p class="cover-subtitle">${esc(ctx.sagaSubtitle || 'Nova & Pling på äventyr!')}</p>
    <p class="cover-tagline">En månad full av magi, äventyr och roliga<br>upptäckter med Nova &amp; Pling.</p>
    <div class="cover-logo">Nova &amp; Pling · Familje-Stunden</div>
  </div>
</div>`
}

function buildContentsPage(
  bgUrl: string,
  aktiviteter: { title: string; content: string }[],
  aktivitetsUrls: string[],
  coloringUrls: string[],
  checklistItems: string[],
  tema?: string,
  diplomaUrl?: string,
): string {
  const temaTitel = tema?.match(/##\s*🎨\s*Månadens tema\s*\n([^\n]+)/)?.[1]?.trim()
    ?? tema?.split('\n').find(l => l.trim() && !l.startsWith('#'))?.trim()
    ?? 'Juni – Sommarmånaden'

  const aktBoxes = aktiviteter.slice(0, 5).map((act, i) => {
    const cleanTitle = act.title.replace(/^[#\s✂️🎯🎨🌿🌊☀️🏖️⭐🔬🎒📚]+/, '').trim()
    const cleanContent = act.content.replace(/\*\*/g, '').replace(/^#+.+$/gm, '').replace(/\n/g, ' ').trim()
    const snippet = cleanContent.slice(0, 55) + (cleanContent.length > 55 ? '…' : '')
    const th = ACTIVITY_THEMES[i % ACTIVITY_THEMES.length]
    const ACCENT = ['#1e40af','#065f46','#c2410c','#be185d','#6d28d9']
    // Image height reduced: 85px → 65px, gives more room for readable text below
    const imgEl = aktivitetsUrls[i]
      ? `<img src="${esc(aktivitetsUrls[i])}" style="width:100%;height:65px;object-fit:cover;object-position:center top;display:block;" alt="Aktivitet ${i + 1}"/>`
      : `<div style="height:65px;background:${th.bg};display:flex;align-items:center;justify-content:center;font-size:1.8rem;">${['🎯','🌿','🏖️','✂️','🌟'][i]}</div>`
    return `
    <div style="flex:1;min-width:0;border:2.5px solid ${ACCENT[i]};border-radius:0.65rem;overflow:hidden;background:#fff;display:flex;flex-direction:column;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
      ${imgEl}
      <div style="padding:0.35rem 0.45rem;flex:1;background:#fff;">
        <div style="font-family:Arial,sans-serif;font-size:0.67rem;font-weight:800;color:${ACCENT[i]};line-height:1.25;margin-bottom:0.15rem;">${esc(cleanTitle.slice(0, 22))}</div>
        <div style="font-size:0.63rem;color:#374151;line-height:1.35;">${esc(snippet)}</div>
      </div>
    </div>`
  }).join('')

  const colorThumbCells = Array.from({ length: 5 }, (_, i) =>
    coloringUrls[i]
      ? `<div style="flex:1;border-radius:0.5rem;overflow:hidden;border:2px solid #d1d5db;background:#fff;"><img src="${esc(coloringUrls[i])}" style="width:100%;height:60px;object-fit:contain;display:block;" alt="Färgläggning ${i + 1}"/></div>`
      : `<div style="flex:1;height:60px;border-radius:0.5rem;border:2px dashed #d1d5db;background:#f9fafb;display:flex;align-items:center;justify-content:center;font-size:1.2rem;color:#d1d5db;">🎨</div>`
  ).join('')

  const learnItems = checklistItems.slice(0, 5).map(item =>
    `<div style="font-size:0.68rem;color:#374151;display:flex;gap:0.3rem;align-items:flex-start;margin-bottom:0.22rem;line-height:1.35;"><span style="color:#e91e8c;flex-shrink:0;">💛</span><span>${esc(item.slice(0, 60))}${item.length > 60 ? '…' : ''}</span></div>`
  ).join('')

  const diplomaBlock = diplomaUrl
    ? `<div style="flex:0.85;border-radius:0.6rem;overflow:hidden;border:2px solid #fbbf24;min-height:72px;"><img src="${esc(diplomaUrl)}" style="width:100%;height:100%;object-fit:cover;" alt="Diplom"/></div>`
    : `<div style="flex:0.85;border-radius:0.6rem;background:linear-gradient(135deg,#78350f,#b45309);display:flex;align-items:center;justify-content:center;min-height:72px;font-size:2rem;">🏅</div>`

  return `
<div class="page">
  ${bgUrl
    ? `<img class="page-bg" src="${esc(bgUrl)}" style="object-fit:cover;" alt="Innehåll"/>`
    : `<div class="page-bg" style="background:linear-gradient(160deg,#fff9f5 0%,#fde8f5 100%);"></div>`}
  <div style="position:absolute;inset:0;background:rgba(255,255,255,0.91);display:flex;flex-direction:column;">

    <!-- ── HEADER ── -->
    <div style="text-align:center;padding:0.85rem 2rem 0.25rem;background:rgba(255,255,255,0.97);">
      <div style="font-family:'Arial Black',Arial,sans-serif;font-size:2.4rem;font-weight:900;color:#e91e8c;line-height:1;letter-spacing:-1px;">INNEHÅLL</div>
      <div style="font-family:Arial,sans-serif;font-size:0.95rem;font-weight:800;color:#1e3a8a;margin-top:0.1rem;">${esc(temaTitel)}!</div>
      <div style="font-size:0.75rem;color:#6b7280;margin-top:0.1rem;">En månad full av sol, äventyr och roliga upptäckter med Nova &amp; Pling.</div>
    </div>

    <!-- ── PINK BANNER ── -->
    <div style="background:#e91e8c;color:#fff;text-align:center;font-family:Arial,sans-serif;font-size:0.72rem;font-weight:700;padding:0.28rem 1rem;letter-spacing:0.03em;flex-shrink:0;">
      💗 Här är allt spännande som väntar i månadspaket! 💗
    </div>

    <!-- ── ACTIVITIES ROW ── -->
    <div style="display:flex;gap:0.4rem;padding:0.45rem 0.7rem 0.25rem;flex-shrink:0;">
      ${aktBoxes}
    </div>

    <!-- ── COLORING THUMBNAILS ── -->
    <div style="padding:0.1rem 0.7rem 0.25rem;flex-shrink:0;">
      <div style="text-align:center;font-family:Arial,sans-serif;font-size:0.7rem;font-weight:700;color:#1e1b4b;margin-bottom:0.2rem;">⭐ 5st Färgläggningsbilder ⭐</div>
      <div style="display:flex;gap:0.3rem;border:2px dashed #d1d5db;border-radius:0.7rem;padding:0.28rem;">
        ${colorThumbCells}
      </div>
    </div>

    <!-- ── SAGA / BILDSAGA / KLIPP ── -->
    <div style="display:flex;gap:0.4rem;padding:0.1rem 0.7rem 0.25rem;flex-shrink:0;">
      <div style="flex:1;border:2px solid #fce7f3;border-radius:0.6rem;padding:0.5rem 0.4rem;background:#fff;text-align:center;">
        <div style="font-size:1.4rem;line-height:1;">🎧</div>
        <div style="font-family:Arial,sans-serif;font-size:0.7rem;font-weight:800;color:#e91e8c;margin-top:0.15rem;">Ljud saga</div>
        <div style="font-size:0.67rem;color:#6b7280;margin-top:0.12rem;line-height:1.35;">Lyssna på sagan med Nova &amp; Pling.</div>
      </div>
      <div style="flex:1.4;border:2px solid #fce7f3;border-radius:0.6rem;padding:0.45rem;background:#fff;text-align:center;">
        <div style="font-size:1.4rem;line-height:1;">📖</div>
        <div style="font-family:Arial,sans-serif;font-size:0.7rem;font-weight:800;color:#e91e8c;margin-top:0.15rem;">Bildsaga</div>
        <div style="font-size:0.67rem;color:#6b7280;margin-top:0.12rem;line-height:1.35;">Läs sagan med bilder – följ med Nova &amp; Pling på äventyr!</div>
      </div>
      <div style="flex:1;border:2px solid #fce7f3;border-radius:0.6rem;padding:0.5rem 0.4rem;background:#fff;text-align:center;">
        <div style="font-size:1.4rem;line-height:1;">✂️</div>
        <div style="font-family:Arial,sans-serif;font-size:0.7rem;font-weight:800;color:#e91e8c;margin-top:0.15rem;">Klipp &amp; klistra</div>
        <div style="font-size:0.67rem;color:#6b7280;margin-top:0.12rem;line-height:1.35;">Klipp och klistra ihop din egna bild. Träna ordning!</div>
      </div>
    </div>

    <!-- ── DIPLOMA PREVIEW + LEARNING ── -->
    <div style="display:flex;gap:0.4rem;padding:0.1rem 0.7rem 0.25rem;flex:1;min-height:0;">
      ${diplomaBlock}
      <div style="flex:1.15;background:#fef9e7;border:2px solid #fbbf24;border-radius:0.6rem;padding:0.55rem 0.6rem;overflow:hidden;">
        <div style="font-family:Arial,sans-serif;font-size:0.72rem;font-weight:800;color:#92400e;margin-bottom:0.3rem;">Vad lär vi oss? 🌟</div>
        ${learnItems || '<div style="font-size:0.68rem;color:#6b7280;">Kul fakta och lärdom för hela familjen!</div>'}
      </div>
    </div>

    <!-- ── FOOTER ── -->
    <div style="background:#fce4ec;border-top:2px solid #f8bbd9;text-align:center;padding:0.32rem 1rem;font-family:Arial,sans-serif;font-size:0.68rem;color:#e91e8c;font-weight:600;flex-shrink:0;">
      💗 Följ med Nova &amp; Pling på ännu fler äventyr – lär, lek och skapa tillsammans! 💗
    </div>

  </div>
</div>`
}

function buildSagaInfoPage(ctx: MonthlyContext, bgUrl: string, baseUrl: string, hasBakedTitle = false): string {
  if (hasBakedTitle && bgUrl) {
    // Dedicated saga cover — title is baked in the illustration (bright cartoon, Juni-style).
    // Show only the two action buttons at the bottom.
    return `
<div class="page">
  <img class="page-bg" src="${esc(bgUrl)}" alt="Saga omslag"/>
  <div class="saga-btns no-print" style="position:absolute;bottom:2.5rem;left:50%;transform:translateX(-50%);display:flex;gap:1rem;z-index:10;">
    <a href="${baseUrl}/api/runs/${ctx.runId}/ebook?format=pdf" target="_blank" style="display:inline-flex;align-items:center;gap:.5rem;padding:.75rem 1.8rem;border-radius:999px;background:#e91e8c;color:#fff;font-family:'Arial Black',Arial,sans-serif;font-size:.9rem;font-weight:900;text-decoration:none;box-shadow:0 4px 16px rgba(233,30,140,.5);letter-spacing:.03em;">📖 Läs sagan</a>
    <a href="${baseUrl}/api/runs/${ctx.runId}/mp3-manus" target="_blank" style="display:inline-flex;align-items:center;gap:.5rem;padding:.75rem 1.8rem;border-radius:999px;background:#059669;color:#fff;font-family:'Arial Black',Arial,sans-serif;font-size:.9rem;font-weight:900;text-decoration:none;box-shadow:0 4px 16px rgba(5,150,105,.5);letter-spacing:.03em;">🎙️ Lyssna</a>
  </div>
</div>`
  }

  return `
<div class="page">
  ${bgUrl
    ? `<img class="page-bg" src="${esc(bgUrl)}" alt="Saga"/>`
    : `<div class="page-bg" style="background:linear-gradient(160deg,#1a1035 0%,#4338ca 100%);"></div>`}
  <div class="saga-info-overlay">
    <span class="saga-info-badge">📖 Bildsagan</span>
    <h2 class="saga-info-title">${esc(ctx.sagaTitle)}</h2>
    <p class="saga-info-sub">${esc(ctx.sagaSubtitle)}</p>
    <div class="saga-btns no-print">
      <a class="saga-btn" href="${baseUrl}/api/runs/${ctx.runId}/ebook?format=pdf" target="_blank" style="background:#e91e8c;">🖨️ Saga PDF</a>
      <a class="saga-btn" href="${baseUrl}/api/runs/${ctx.runId}/mp3-manus" target="_blank" style="background:#059669;">🎙️ Ljudsaga</a>
    </div>
  </div>
</div>`
}

/** Parse an activity's markdown into structured sections */
function parseActivitySections(content: string): {
  description: string
  materials: string[]
  steps: string[]
  discussion: string[]
} {
  // Helper: extract bullet/numbered items from a text block
  function extractItems(text: string | undefined): string[] {
    if (!text) return []
    return text.split('\n')
      .map(l => l.match(/^(?:[-•*]|\d+[.)]) *(.+)/)?.[1]?.trim())
      .filter((s): s is string => typeof s === 'string' && s.length > 2)
  }

  // Find a named section (bold header or ## heading) and return its content until next section
  function findSection(names: string[]): string | undefined {
    const pattern = new RegExp(
      `(?:\\*{1,2})?(?:${names.join('|')})[:\\s*]*\\*{0,2}[\\s\\n]+((?:[\\s\\S]*?))(?=\\n\\*{1,2}[A-ZÅÄÖ]|\\n##|$)`,
      'i'
    )
    return content.match(pattern)?.[1]?.trim()
  }

  const materialsText  = findSection(['Material', 'Du behöver', 'Det här behöver du', 'Behöver du', 'Vad behövs'])
  const stepsText      = findSection(['Gör så här', 'Så gör ni', 'Instruktioner', 'Steg för steg', 'Genomförande'])
  const discussionText = findSection(['Prata tillsammans', 'Diskutera', 'Diskussionsfrågor', 'Frågor att prata om'])

  // Description: everything before the first ** or ## section, stripped of markdown
  const description = content
    .split(/\n\*{1,2}[A-ZÅÄÖ]|\n##/)[0]
    ?.replace(/\*\*/g, '').replace(/\*/g, '').trim()
    .slice(0, 200) ?? ''

  return {
    description,
    materials:  extractItems(materialsText),
    steps:      extractItems(stepsText),
    discussion: extractItems(discussionText),
  }
}

function buildActivityPage(
  act: { title: string; content: string },
  index: number,
  imgUrl: string,
): string {
  const theme = ACTIVITY_THEMES[index % ACTIVITY_THEMES.length]
  const cleanTitle = act.title
    .replace(/^[#\s✂️🎯🎨🌿🌊☀️🏖️⭐🔬🎒📚🌸]+/, '')   // strip emoji/# prefix
    .replace(/^\d+[.)]\s*/, '')                           // strip leading "3. " or "3) "
    .trim()

  const parsed = parseActivitySections(act.content)

  // Fallback: if no structured sections, extract bullets and numbered items from raw
  const materials = parsed.materials.length > 0
    ? parsed.materials.slice(0, 6)
    : act.content.split('\n').filter(l => /^[-•*]\s/.test(l)).map(l => l.replace(/^[-•*]\s*/, '').trim()).slice(0, 6)

  const steps = parsed.steps.length > 0
    ? parsed.steps.slice(0, 7)
    : act.content.split('\n').filter(l => /^\d+[.)]\s/.test(l)).map(l => l.replace(/^\d+[.)]\s*/, '').trim()).slice(0, 7)

  const discussion = parsed.discussion.length > 0
    ? parsed.discussion.slice(0, 4)
    : ['Vad tyckte ni bäst?', 'Vad var svårast?', 'Vad lärde ni er?']

  // Theme accent colors for the badge and numbered steps
  const ACCENT = ['#1e40af', '#065f46', '#c2410c', '#be185d', '#6d28d9']
  const accent = ACCENT[index % ACCENT.length]

  // Motivational suffix
  const suffixes = ['are', 'are', 'are', 'are', 'are']
  const firstWord = cleanTitle.split(/\s+/)[0] ?? 'Äventyr'

  return `
<div class="page" style="background:#fffdf9;display:flex;flex-direction:column;">

  <!-- ── TOP: illustration (≈43% of A4) ── -->
  <div style="position:relative;flex:0 0 43%;overflow:hidden;">
    ${imgUrl
      ? `<img src="${esc(imgUrl)}" style="width:100%;height:100%;object-fit:cover;object-position:center top;" alt="Aktivitet ${index + 1}"/>`
      : `<div style="width:100%;height:100%;background:${theme.bg};display:flex;align-items:center;justify-content:center;font-size:5rem;">${['🎯','🌿','🏖️','✂️','🌟'][index % 5]}</div>`}
    <!-- Gradient at bottom of image to blend into white -->
    <div style="position:absolute;bottom:0;left:0;right:0;height:45%;background:linear-gradient(transparent,rgba(0,0,0,0.62));"></div>
    <!-- Title overlaid on bottom of image -->
    <div style="position:absolute;bottom:0;left:0;right:0;padding:0.9rem 1.4rem 0.65rem;">
      <div style="font-family:'Arial Black',Arial,sans-serif;font-size:1.85rem;font-weight:900;color:#fff;text-shadow:2px 2px 6px rgba(0,0,0,0.55);line-height:1.1;">${esc(cleanTitle)}</div>
      ${parsed.description ? `<p style="font-size:0.72rem;color:rgba(255,255,255,0.92);margin-top:0.25rem;line-height:1.4;max-width:85%;">${esc(parsed.description.slice(0, 150))}</p>` : ''}
    </div>
    <!-- Aktivitet badge top-right -->
    <div style="position:absolute;top:0.65rem;right:0.65rem;background:${accent};color:#fff;font-family:Arial,sans-serif;font-size:0.55rem;font-weight:800;letter-spacing:0.15em;text-transform:uppercase;padding:0.25rem 0.7rem;border-radius:999px;box-shadow:0 2px 8px rgba(0,0,0,0.3);">Aktivitet ${index + 1}</div>
  </div>

  <!-- ── MIDDLE: Three content boxes ── -->
  <div style="display:flex;gap:0.45rem;padding:0.45rem 0.65rem 0.3rem;flex:0 0 auto;">

    <!-- BOX 1: Det här behöver du (amber) -->
    <div style="flex:1;background:#fffbeb;border:2px solid #fde68a;border-radius:0.65rem;padding:0.45rem 0.55rem;overflow:hidden;">
      <div style="display:flex;align-items:center;gap:0.25rem;margin-bottom:0.28rem;">
        <span style="font-size:0.95rem;">⭐</span>
        <span style="font-family:Arial,sans-serif;font-size:0.56rem;font-weight:800;color:#92400e;text-transform:uppercase;letter-spacing:0.04em;">Det här behöver du</span>
      </div>
      ${materials.length > 0
        ? materials.map(item => `<div style="display:flex;gap:0.28rem;align-items:flex-start;margin-bottom:0.2rem;"><span style="color:#f59e0b;font-size:0.65rem;flex-shrink:0;line-height:1.4;">●</span><span style="font-size:0.62rem;color:#374151;line-height:1.35;">${esc(item.slice(0, 55))}</span></div>`).join('')
        : '<div style="font-size:0.6rem;color:#6b7280;font-style:italic;">Se beskrivningen ovan.</div>'}
    </div>

    <!-- BOX 2: Gör så här — numbered steps (blue) -->
    <div style="flex:1.35;background:#eff6ff;border:2px solid #bfdbfe;border-radius:0.65rem;padding:0.45rem 0.55rem;overflow:hidden;">
      <div style="display:flex;align-items:center;gap:0.25rem;margin-bottom:0.28rem;">
        <span style="font-size:0.95rem;">📋</span>
        <span style="font-family:Arial,sans-serif;font-size:0.56rem;font-weight:800;color:#1e40af;text-transform:uppercase;letter-spacing:0.04em;">Gör så här</span>
      </div>
      ${steps.length > 0
        ? steps.map((item, si) => `<div style="display:flex;gap:0.28rem;align-items:flex-start;margin-bottom:0.2rem;"><div style="background:#1e40af;color:#fff;border-radius:50%;min-width:1rem;height:1rem;font-size:0.48rem;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${si + 1}</div><span style="font-size:0.62rem;color:#374151;line-height:1.35;">${esc(item.slice(0, 80))}</span></div>`).join('')
        : `<div style="font-size:0.62rem;color:#374151;line-height:1.5;">${esc(act.content.replace(/\*\*/g, '').replace(/^#+.+$/gm, '').trim().slice(0, 350))}</div>`}
    </div>

    <!-- BOX 3: Prata tillsammans (pink) -->
    <div style="flex:1;background:#fdf2f8;border:2px solid #fbcfe8;border-radius:0.65rem;padding:0.45rem 0.55rem;overflow:hidden;">
      <div style="display:flex;align-items:center;gap:0.25rem;margin-bottom:0.28rem;">
        <span style="font-size:0.95rem;">💬</span>
        <span style="font-family:Arial,sans-serif;font-size:0.56rem;font-weight:800;color:#9d174d;text-transform:uppercase;letter-spacing:0.04em;">Prata tillsammans</span>
      </div>
      ${discussion.map(item => `<div style="display:flex;gap:0.28rem;align-items:flex-start;margin-bottom:0.2rem;"><span style="color:#e91e8c;font-size:0.65rem;flex-shrink:0;line-height:1.4;">❓</span><span style="font-size:0.62rem;color:#374151;line-height:1.35;">${esc(item.slice(0, 65))}</span></div>`).join('')}
    </div>
  </div>

  <!-- ── DRAW / ACTIVITY AREA ── -->
  <div style="flex:1;margin:0 0.65rem;border:2.5px dashed #d1d5db;border-radius:0.65rem;padding:0.35rem 0.65rem;display:flex;flex-direction:column;min-height:3rem;">
    <div style="font-family:Arial,sans-serif;font-size:0.6rem;font-weight:800;color:#6b7280;">✏️ Rita, skriv eller klistra in här!</div>
  </div>

  <!-- ── TIPS ROW ── -->
  <div style="margin:0.3rem 0.65rem 0;background:#fffbeb;border:1.5px solid #fde68a;border-radius:0.45rem;padding:0.28rem 0.6rem;">
    <span style="font-family:Arial,sans-serif;font-size:0.58rem;color:#78350f;"><strong>💡 Tips!</strong> Gör det gärna mer än en gång — det blir roligare varje gång!</span>
  </div>

  <!-- ── FOOTER BANNER ── -->
  <div style="margin-top:0.3rem;background:linear-gradient(135deg,#e91e8c 0%,#c2185b 100%);text-align:center;padding:0.5rem 1rem;font-family:'Arial Black',Arial,sans-serif;font-size:0.88rem;font-weight:900;color:#fff;letter-spacing:0.03em;flex-shrink:0;">
    ❤️ Bra jobbat, ${esc(firstWord)}are! ⭐
  </div>

</div>`
}

function buildColoringPage(index: number, imgUrl: string): string {
  return `
<div class="page" style="background:#fff;">
  ${imgUrl
    ? `<img class="page-bg" src="${esc(imgUrl)}" alt="Färgläggningsbild ${index + 1}" style="object-fit:contain;padding:1.5rem;"/>`
    : `<div class="coloring-placeholder">
        <span>🎨</span>
        <p>Färgläggningsbild ${index + 1} av Nova &amp; Pling</p>
       </div>`}
  <span class="coloring-label">Familje-Stunden · Nova &amp; Pling · Bild ${index + 1}/5</span>
</div>`
}

function buildCraftPage(title: string, content: string, imgUrl = ''): string {
  const cleanTitle = title.replace(/^[#\s✂️🎨🌿✨]+/, '').trim()

  // Detect if this is a cutting/scissors activity — add dashed cut-line decorations
  const hasCutting = /klipp|sax|skär|strimla/i.test(title + ' ' + content)

  // Parse materials and steps from content
  function extractList(text: string, patterns: RegExp[]): string[] {
    for (const pat of patterns) {
      const match = text.match(pat)
      if (match?.[1]) {
        return match[1].split('\n')
          .map(l => l.match(/^(?:[-•*]|\d+[.)]) *(.+)/)?.[1]?.trim() ?? '')
          .filter(s => s.length > 2)
          .slice(0, 8)
      }
    }
    return []
  }

  const materialLines = extractList(content, [
    /(?:\*{0,2})(?:Material|Du behöver|Det här behöver du)[:\s*]{0,3}\*{0,2}\s*\n([\s\S]*?)(?=\n\*{0,2}(?:Steg|Gör|Instruktioner|Resultat)|$)/i,
  ])
  const stepLines = extractList(content, [
    /(?:\*{0,2})(?:Steg|Gör så här|Instruktioner)[:\s*]{0,3}\*{0,2}\s*\n([\s\S]*?)(?=\n\*{0,2}(?:Resultat|Tips|Material)|$)/i,
  ])
  const resultMatch = content.match(/(?:\*{0,2})(?:Resultat|Tips)[:\s*]{0,3}\*{0,2}\s*([^\n]+)/i)
  const result = resultMatch?.[1]?.trim() ?? ''

  // Fallback: if no structured sections, split lines into steps
  const allLines = content.split('\n').filter(l => l.trim())
  const fallbackSteps = allLines
    .map(l => l.match(/^(?:\d+[.)]\s*|[-•*]\s*)(.+)/)?.[1] ?? '')
    .filter(s => s.length > 3)
    .slice(0, 8)

  const materials = materialLines.length > 0 ? materialLines : []
  const steps = stepLines.length > 0 ? stepLines : fallbackSteps

  // ── Cutting pattern decoration ────────────────────────────────────────────
  const cuttingDecor = hasCutting ? `
    <!-- Dashed cut line across the illustration -->
    <div style="position:absolute;top:42%;left:0;right:0;z-index:4;pointer-events:none;display:flex;align-items:center;gap:0;">
      <span style="font-size:1.1rem;margin-left:0.5rem;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5));">✂️</span>
      <div style="flex:1;height:0;border-top:2.5px dashed rgba(255,255,255,0.85);margin:0 0.4rem;"></div>
    </div>` : ''

  // ── Materials list HTML ───────────────────────────────────────────────────
  const materialsHtml = materials.length > 0
    ? materials.map(m => `<div style="display:flex;gap:0.4rem;align-items:flex-start;margin-bottom:0.22rem;"><span style="color:#f59e0b;font-size:0.75rem;flex-shrink:0;margin-top:0.05rem;">●</span><span style="font-size:0.68rem;color:#1c1917;line-height:1.35;">${esc(m)}</span></div>`).join('')
    : '<div style="font-size:0.68rem;color:#78350f;font-style:italic;">Se beskrivningen nedan</div>'

  // ── Steps list HTML ───────────────────────────────────────────────────────
  const stepsHtml = steps.length > 0
    ? steps.map((s, i) => `
      <div style="display:flex;gap:0.5rem;align-items:flex-start;margin-bottom:0.28rem;">
        <div style="min-width:1.25rem;height:1.25rem;border-radius:50%;background:#3b82f6;color:#fff;font-family:Arial,sans-serif;font-size:0.6rem;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:0.05rem;">${i + 1}</div>
        <span style="font-size:0.66rem;color:#1e3a8a;line-height:1.38;">${esc(s)}</span>
      </div>`).join('')
    : `<div style="font-size:0.68rem;color:#1e3a8a;font-style:italic;">${esc(content.slice(0, 200))}</div>`

  return `
<div class="page">
  <!-- Background illustration — top 43% -->
  ${imgUrl
    ? `<img class="page-bg" src="${esc(imgUrl)}" alt="Pyssel illustration" style="object-position:center top;"/>`
    : `<div class="page-bg" style="background:linear-gradient(160deg,#f59e0b 0%,#fbbf24 35%,#fde68a 60%,#fff7ed 100%);"></div>`}

  <!-- Dark gradient fade from illustration into content area -->
  <div style="position:absolute;top:38%;left:0;right:0;bottom:0;background:linear-gradient(to bottom,transparent 0%,rgba(255,247,237,0.97) 15%,rgba(255,247,237,1) 100%);z-index:2;"></div>

  ${cuttingDecor}

  <!-- ── Top header strip (over illustration) ── -->
  <div style="position:absolute;top:0;left:0;right:0;z-index:5;padding:1rem 1.4rem 0.6rem;background:linear-gradient(to bottom,rgba(0,0,0,0.55) 0%,transparent 100%);">
    <div style="display:inline-block;font-family:Arial,sans-serif;font-size:0.6rem;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#fff;background:rgba(245,158,11,0.9);padding:0.25rem 0.9rem;border-radius:999px;">✂️ Pyssel &amp; Hantverk</div>
    <div style="font-family:'Arial Black',Arial,sans-serif;font-size:1.8rem;font-weight:900;color:#fff;margin-top:0.35rem;line-height:1.1;text-shadow:2px 2px 0 rgba(0,0,0,0.5),0 4px 16px rgba(0,0,0,0.4);">${esc(cleanTitle)}</div>
  </div>

  <!-- ── Content boxes (z-index:6 over gradient) ── -->
  <div style="position:absolute;top:40%;left:0;right:0;bottom:0;z-index:6;display:flex;flex-direction:column;padding:0.6rem 1.1rem 0.9rem;gap:0.55rem;">

    <div style="display:flex;gap:0.6rem;flex:1;min-height:0;">

      <!-- Materials box -->
      <div style="flex:0 0 38%;display:flex;flex-direction:column;background:#fffbeb;border:2px solid #f59e0b;border-radius:0.8rem;overflow:hidden;box-shadow:0 2px 10px rgba(245,158,11,0.18);">
        <div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:0.35rem 0.65rem;display:flex;align-items:center;gap:0.3rem;">
          <span style="font-size:0.8rem;">🧰</span>
          <span style="font-family:Arial,sans-serif;font-size:0.62rem;font-weight:800;color:#fff;letter-spacing:0.04em;">DET HÄR BEHÖVER DU</span>
        </div>
        <div style="padding:0.5rem 0.65rem;flex:1;overflow:hidden;">
          ${materialsHtml}
        </div>
      </div>

      <!-- Steps box -->
      <div style="flex:1;display:flex;flex-direction:column;background:#eff6ff;border:2px solid #3b82f6;border-radius:0.8rem;overflow:hidden;box-shadow:0 2px 10px rgba(59,130,246,0.18);">
        <div style="background:linear-gradient(135deg,#1d4ed8,#3b82f6);padding:0.35rem 0.65rem;display:flex;align-items:center;gap:0.3rem;">
          <span style="font-size:0.8rem;">🪄</span>
          <span style="font-family:Arial,sans-serif;font-size:0.62rem;font-weight:800;color:#fff;letter-spacing:0.04em;">GÖR SÅ HÄR — STEG FÖR STEG</span>
        </div>
        <div style="padding:0.5rem 0.75rem;flex:1;overflow:hidden;">
          ${stepsHtml}
        </div>
      </div>
    </div>

    ${result ? `
    <!-- Result / Tips box -->
    <div style="background:linear-gradient(135deg,#fdf2f8,#fce7f3);border:2px solid #ec4899;border-radius:0.75rem;padding:0.45rem 0.85rem;display:flex;align-items:center;gap:0.5rem;box-shadow:0 2px 8px rgba(236,72,153,0.15);">
      <span style="font-size:1rem;flex-shrink:0;">🌟</span>
      <span style="font-family:Arial,sans-serif;font-size:0.66rem;color:#9d174d;line-height:1.4;"><strong>Resultat:</strong> ${esc(result)}</span>
    </div>` : ''}

    ${hasCutting ? `
    <!-- Cutting instruction decoration -->
    <div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.75rem;background:rgba(245,158,11,0.1);border-radius:0.6rem;border:1.5px dashed #f59e0b;">
      <span style="font-size:0.85rem;">✂️</span>
      <div style="flex:1;display:flex;align-items:center;gap:0.3rem;">
        <div style="flex:1;height:0;border-top:1.5px dashed #f59e0b;"></div>
        <span style="font-family:Arial,sans-serif;font-size:0.6rem;font-weight:700;color:#b45309;letter-spacing:0.05em;">KLIPP HÄR</span>
        <div style="flex:1;height:0;border-top:1.5px dashed #f59e0b;"></div>
      </div>
      <span style="font-size:0.85rem;">✂️</span>
    </div>` : ''}

  </div>
</div>`
}

function buildChecklistPage(items: string[], bgUrl = '', tema = ''): string {
  const defaultItems = [
    'Jag har lyssnat på sagan om Nova & Pling',
    'Jag har prövat minst en aktivitet',
    'Jag har färglagt en bild',
    'Jag har pratat om månadens lärdom',
    'Jag har berättat om äventyret för någon annan',
  ]
  const list = items.length > 0 ? items : defaultItems

  // Extrahera månadsnamnet ur tema-texten, t.ex. "Sagomånaden", "Blomstermånaden" etc.
  // Använd samma specifika regex som buildContentsPage för att hitta rätt sektion.
  const rawMonthName = tema
    ? (tema.match(/##\s*🎨\s*Månadens tema[^\n]*\n([^\n]+)/)?.[1]?.trim()
      ?? tema.split('\n')
           .map(l => l.trim())
           .find(l => l.length > 4 && !l.startsWith('#') && !/^[-–—=*\s]+$/.test(l))
      ?? '')
    : ''
  // Strippa markdown-bold (**...**), kursiv (*...*) och trunkera vid lång text
  const monthName = rawMonthName
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#+\s*/, '')
    .split('—')[0]   // ta bara den första delen om det är "X — lång undertitel"
    .split('–')[0]
    .trim()
    .slice(0, 40)    // max 40 tecken för att rubriken inte ska bli för lång

  const kryskartaTitel = monthName
    ? `Min krysskarta för ${monthName}`
    : 'Min krysskarta'

  return `
<div class="page">
  ${bgUrl
    ? `<img class="page-bg" src="${esc(bgUrl)}" alt="Krysslista"/>`
    : `<div class="page-bg" style="background:linear-gradient(160deg,#052e16 0%,#14532d 60%,#166534 100%);"></div>`}
  <div class="checklist-overlay">
    <span class="checklist-eyebrow">⭐ Månadskrysskarta</span>
    <h1>${esc(kryskartaTitel)}</h1>
    <p>(Fyll i eller kryssa varje gång du gör något!)</p>

    <!-- Namn-fält -->
    <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:1.2rem;">
      <span style="color:rgba(255,255,255,0.85);font-size:0.9rem;font-weight:700;white-space:nowrap;">Namn:</span>
      <div style="flex:1;border-bottom:2px solid rgba(255,255,255,0.5);height:1.4rem;"></div>
    </div>

    <div class="check-items">
      ${list.map(item => `
      <div class="check-item">
        <div class="check-box"></div>
        <span class="check-text">${esc(item)}</span>
      </div>`).join('')}
    </div>
  </div>
</div>`
}

function buildDiplomaPage(achievement: string, bgUrl = ''): string {
  // Diplomet byggs alltid i HTML/CSS — referensbilder används ENBART som stil-guider
  // för images.edit() i runner.ts, aldrig som direkta bakgrunder i PDF:en.
  // bgUrl här är en AI-genererad sagobild som bakgrundsatmosfär om tillgänglig.
  return `
<div class="page" style="background:linear-gradient(160deg,#fffbf0 0%,#fef9e7 100%);">
  <!-- Dekorativ guldlinje-ram -->
  <div style="position:absolute;inset:1.4rem;border:6px solid #fbbf24;border-radius:2.2rem;
              box-shadow:0 0 0 10px rgba(251,191,36,0.12),inset 0 0 0 3px rgba(251,191,36,0.25);"></div>
  <!-- Stämningsbakgrund -->
  <div style="position:absolute;inset:0;background-image:
    radial-gradient(circle at 15% 15%, rgba(251,191,36,0.07) 0%,transparent 40%),
    radial-gradient(circle at 85% 85%, rgba(233,30,140,0.05) 0%,transparent 40%);"></div>

  <div style="position:relative;z-index:1;display:flex;flex-direction:column;
              align-items:center;justify-content:space-between;
              height:100%;padding:3rem 3rem 2.5rem;text-align:center;">

    <!-- Toppstjärnor -->
    <div style="font-size:1.6rem;letter-spacing:0.6rem;color:#fbbf24;">⭐ 🌟 ⭐</div>

    <!-- Titel -->
    <div style="font-family:'Arial Black',Arial,sans-serif;font-size:4.2rem;font-weight:900;
                color:#f59e0b;letter-spacing:0.12em;line-height:1;
                text-shadow:3px 3px 0 #d97706,0 6px 24px rgba(245,158,11,0.25);">DIPLOM</div>

    <!-- Rosa banner -->
    <div style="background:linear-gradient(135deg,#e91e8c 0%,#c2185b 100%);
                color:#fff;font-family:'Arial Black',Arial,sans-serif;
                font-size:1.05rem;font-weight:900;padding:0.45rem 2.8rem;
                border-radius:999px;letter-spacing:0.1em;
                box-shadow:0 4px 18px rgba(233,30,140,0.35);">ÄVENTYRARE</div>

    <!-- Stjärnrad -->
    <div style="font-size:1.4rem;letter-spacing:0.9rem;color:#fbbf24;">★ ★ ★</div>

    <!-- "Detta diplom" -->
    <p style="font-family:Georgia,serif;font-size:1rem;color:#78350f;font-weight:600;">
      Detta diplom tilldelas:
    </p>

    <!-- Namnrad -->
    <div style="border-bottom:2.5px solid #d97706;width:68%;height:2.4rem;"></div>

    <!-- Prestationstext -->
    <p style="font-family:Georgia,serif;font-size:1rem;color:#92400e;
              line-height:1.7;max-width:76%;font-style:italic;">
      ${esc(achievement)}
    </p>

    <!-- Grattis -->
    <div style="font-family:'Arial Black',Arial,sans-serif;font-size:1.35rem;
                font-weight:900;color:#e91e8c;">Grattis, äventyrare! 🎉</div>

    <!-- Dekorativa emojis -->
    <div style="font-size:1.7rem;letter-spacing:0.5rem;">🌊 🐚 🏖️ ☀️ 🌺</div>

    <!-- Datum + Underskrift -->
    <div style="display:flex;gap:4rem;">
      <div>
        <div style="border-bottom:2px solid #d97706;width:10rem;height:1.8rem;"></div>
        <div style="font-family:Arial,sans-serif;font-size:0.62rem;letter-spacing:0.12em;
                    color:#d97706;text-transform:uppercase;margin-top:0.35rem;">Datum</div>
      </div>
      <div>
        <div style="border-bottom:2px solid #d97706;width:10rem;height:1.8rem;"></div>
        <div style="font-family:Arial,sans-serif;font-size:0.62rem;letter-spacing:0.12em;
                    color:#d97706;text-transform:uppercase;margin-top:0.35rem;">Underskrift</div>
      </div>
    </div>

    <!-- Footer -->
    <div style="font-family:Arial,sans-serif;font-size:0.68rem;letter-spacing:0.15em;
                color:#d97706;opacity:0.65;text-transform:uppercase;">
      💛 Nova &amp; Pling · Familje-Stunden 💛
    </div>

  </div>
</div>`
}

function buildClosingPage(bgUrl: string): string {
  return `
<div class="page" style="display:flex;flex-direction:column;overflow:hidden;">

  <!-- ── TOP HALF: Summary ── -->
  <div style="position:relative;flex:0 0 54%;overflow:hidden;">
    ${bgUrl
      ? `<img src="${esc(bgUrl)}" style="width:100%;height:100%;object-fit:cover;object-position:center top;" alt="Avslutning"/>`
      : `<div style="width:100%;height:100%;background:linear-gradient(160deg,#7c3aed 0%,#db2777 100%);"></div>`}
    <div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,0.08) 0%,rgba(0,0,0,0.55) 100%);display:flex;flex-direction:column;justify-content:flex-end;padding:1.2rem 2rem;">
      <div style="font-family:'Arial Black',Arial,sans-serif;font-size:1.7rem;font-weight:900;color:#fbbf24;text-shadow:2px 2px 0 rgba(0,0,0,0.5);line-height:1.1;margin-bottom:0.5rem;">Bra jobbat, Sagomäntyrare! 🌟</div>
      <div style="background:rgba(255,255,255,0.93);border-radius:0.8rem;padding:0.65rem 1rem;">
        <div style="font-family:Arial,sans-serif;font-size:0.7rem;font-weight:700;color:#1e1b4b;margin-bottom:0.35rem;">Tack för att ni följde med på Juli – Sagomånaden! 💗</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.18rem 0.8rem;">
          ${['🧙 Lyssnat på sagan', '📖 Läst bildsagan tillsammans', '⭐ Löst sagogåtor', '🎨 Färglagt sagokaraktärer', '✂️ Klistrat sagobilder', '💬 Fantiserat och pratat'].map(item => `<div style="font-size:0.6rem;color:#374151;display:flex;gap:0.2rem;align-items:center;">${item}</div>`).join('')}
        </div>
        <div style="font-family:Arial,sans-serif;font-size:0.68rem;font-weight:800;color:#e91e8c;margin-top:0.35rem;text-align:center;">Nova &amp; Pling är så stolta över er! 💛</div>
      </div>
    </div>
  </div>

  <!-- ── BOTTOM HALF: Skolstartsmånaden teaser ── -->
  <div style="flex:1;background:linear-gradient(160deg,#1e1b4b 0%,#312e81 55%,#4c1d95 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1.2rem 2rem;position:relative;overflow:hidden;">
    <!-- Decorative star pattern -->
    <div style="position:absolute;inset:0;pointer-events:none;overflow:hidden;opacity:0.18;">
      <div style="font-size:1.1rem;line-height:2rem;letter-spacing:1.5rem;white-space:nowrap;padding:0.5rem;">⭐🌟✨⭐🌟✨⭐🌟✨⭐🌟✨⭐🌟✨⭐🌟✨⭐🌟✨⭐🌟✨⭐🌟</div>
      <div style="font-size:1.1rem;line-height:2rem;letter-spacing:1.5rem;white-space:nowrap;padding:0 0 0.5rem 3rem;">🌟✨⭐🌟✨⭐🌟✨⭐🌟✨⭐🌟✨⭐🌟✨⭐🌟✨⭐🌟✨⭐🌟✨</div>
    </div>
    <div style="position:relative;z-index:1;text-align:center;width:100%;">
      <div style="background:linear-gradient(135deg,#fbbf24,#f59e0b);border-radius:999px;display:inline-block;padding:0.28rem 1.1rem;font-family:Arial,sans-serif;font-size:0.62rem;font-weight:800;color:#78350f;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:0.5rem;">📅 Nästa månad väntar…</div>
      <div style="font-family:'Arial Black',Arial,sans-serif;font-size:2.1rem;font-weight:900;color:#fff;line-height:1;text-shadow:3px 3px 0 rgba(0,0,0,0.4);">📚 SKOLSTARTS-</div>
      <div style="font-family:'Arial Black',Arial,sans-serif;font-size:2.1rem;font-weight:900;color:#fbbf24;line-height:1.05;text-shadow:3px 3px 0 rgba(0,0,0,0.4);margin-bottom:0.5rem;">MÅNADEN!</div>
      <div style="display:flex;flex-direction:column;gap:0.25rem;max-width:68%;margin:0 auto;">
        ${['🎒 Packa skolväskan tillsammans', '✏️ Lär och lek med Nova & Pling', '🌈 Nya kompisar och äventyr väntar', '📖 Ett nytt magiskt äventyr börjar…'].map(item => `<div style="background:rgba(255,255,255,0.13);border-radius:0.45rem;padding:0.26rem 0.7rem;font-family:Arial,sans-serif;font-size:0.65rem;color:rgba(255,255,255,0.93);text-align:left;">${item}</div>`).join('')}
      </div>
      <div style="margin-top:0.6rem;font-family:'Arial Black',Arial,sans-serif;font-size:0.82rem;color:#fbbf24;">Är ni redo för nästa äventyr? ⭐</div>
      <div style="font-family:Arial,sans-serif;font-size:0.52rem;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-top:0.4rem;">Familje-Stunden · Nova &amp; Pling</div>
    </div>
  </div>

</div>`
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function buildMonthlyPdfHtml(ctx: MonthlyContext, baseUrl = ''): string {
  const coloringUrls      = parseImageUrls(ctx.bilder)
  const sagaUrls          = parseImageUrls(ctx.sagabilder)
  const aktivitetsUrls    = parseImageUrls(ctx.aktivitetsbilder)
  const omslagsUrls       = parseImageUrls(ctx.omslagsbilder)   // dedikerade omslagsbilder
  const pysselUrls        = parseImageUrls(ctx.pysselbilder)    // dedikerad pyssel-illustration

  // Parse content
  const allSections  = parseAktiviteter(ctx.aktiviteter ?? '')
  const aktiviteter  = allSections.slice(0, 5)
  const pysselSection = allSections[5] ?? null

  const pysselTitle   = pysselSection?.title ?? 'Klipp & Klistra'
  const pysselContent = pysselSection?.content
    ?? (ctx.komplement?.match(/(?:pyssel|klipp|klistra)[^\n]*\n([\s\S]*?)(?=\n##|\n---|\n\*\*|$)/i)?.[1] ?? '')

  // Extrahera bara KRYSSLISTA-sektionen — annars plockar parsern upp
  // numrerade pyssel-steg som inte hör hemma i krysslistan.
  const kryslText = ctx.komplement?.match(
    /##[^\n]*(?:KRYSSLISTA|KRYSS)[^\n]*\n([\s\S]*?)(?=\n##|$)/i
  )?.[1] ?? ctx.komplement ?? ''
  const checklistItems = parseChecklist(kryslText)

  const achievementMatch = ctx.komplement?.match(/(?:diplom|achievem)[^\n]*\n+([\s\S]*?)(?=\n##|$)/i)
  const achievement = achievementMatch?.[1]?.trim() ?? 'har utforskat och lärt sig massor den här månaden!'

  // Referensbilderna används ENBART i runner.ts som stil-guider för images.edit().
  // PDF:en använder alltid AI-genererade bilder — aldrig referensbilderna direkt.
  // Struktursidor får unika sagabilder; om för få sagabilder tas aktivitetsbilder som backup.
  const allStructureUrls = [...sagaUrls, ...aktivitetsUrls]
  const pick = (i: number) => allStructureUrls[i] ?? ''

  // Dedikerade omslagsbilder har titel inbakad — prioritera dem, annars fallback till sagabilder
  const coverBg     = omslagsUrls[0] || pick(0)
  const sagaBg      = omslagsUrls[1] || pick(1)
  // Flagga om vi har dedikerade omslagsbilder med inbakad text
  const hasBakedCover = omslagsUrls.length > 0
  const hasBakedSagaCover = omslagsUrls.length > 1
  const contentsBg  = pick(2)
  const checklistBg = pick(3)
  const diplomaBg   = pick(4)
  const closingBg   = sagaUrls[sagaUrls.length - 1] !== pick(0)
    ? sagaUrls[sagaUrls.length - 1]
    : (aktivitetsUrls[aktivitetsUrls.length - 1] ?? pick(5) ?? '')

  // Build pages
  const activityPages = aktiviteter.map((act, i) => {
    // Prefer dedicated activity illustration; fall back to nothing (colorful gradient bg)
    const imgUrl = aktivitetsUrls[i] ?? ''
    return buildActivityPage(act, i, imgUrl)
  }).join('\n')

  const coloringPages = Array.from({ length: 5 }, (_, i) =>
    buildColoringPage(i, coloringUrls[i] ?? '')
  ).join('\n')

  return `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(ctx.sagaTitle)} — Familje-Stunden Månadspaket</title>
<style>${STYLES}</style>
</head>
<body>

<!-- Toolbar — hidden when printing -->
<div class="no-print-toolbar">
  <div style="display:flex;align-items:center;gap:1rem;min-width:0">
    <span class="toolbar-title">📦 ${esc(ctx.sagaTitle)} — Familje-Stunden Månadspaket</span>
    <span class="toolbar-hint">Tryck "Skriv ut" → välj "Spara som PDF" i skrivardialogens destination</span>
  </div>
  <div class="toolbar-actions">
    <button class="btn btn-download" onclick="downloadHtml()">⬇️ Ladda ner .html</button>
    <button class="btn btn-print" onclick="window.print()">🖨️ Skriv ut / Spara PDF</button>
    <a class="btn btn-back" href="javascript:history.back()">← Tillbaka</a>
  </div>
</div>
<div class="toolbar-spacer no-print-toolbar-spacer"></div>

<script>
  function downloadHtml() {
    const safeTitle = ${JSON.stringify(ctx.sagaTitle.replace(/[^a-zA-Z0-9åäöÅÄÖ\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase())};
    const blob = new Blob([document.documentElement.outerHTML], { type: 'text/html; charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'familje-stunden-' + safeTitle + '.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }
</script>

${buildCoverPage(ctx, coverBg, hasBakedCover)}
${buildContentsPage(contentsBg, aktiviteter, aktivitetsUrls, coloringUrls, checklistItems, ctx.tema, diplomaBg)}
${buildSagaInfoPage(ctx, sagaBg, baseUrl, hasBakedSagaCover)}
${activityPages}
${coloringPages}
${buildCraftPage(pysselTitle, pysselContent, pysselUrls[0] ?? '')}
${buildChecklistPage(checklistItems, checklistBg, ctx.tema ?? '')}
${buildDiplomaPage(achievement, diplomaBg)}
${buildClosingPage(closingBg)}

</body>
</html>`
}
