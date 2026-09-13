/**
 * vNext Global Design Foundation — the token and font contract.
 *
 * Two defects made vNext surfaces render something other than they declared,
 * and neither was visible to a test that only reads declarations:
 *
 *   1. UNDEFINED TOKENS. Six vNext surfaces styled borders, tints, dimmed text
 *      and their ambient light with `rgb(var(--foreground-rgb) / a)` and
 *      `rgb(var(--omnira-violet-rgb) / a)` — 265 declarations — and neither
 *      variable was defined anywhere. A declaration whose `var()` is undefined
 *      is invalid at computed-value time: a border resets to none, a background
 *      to transparent (taking every other gradient layer of the same declaration
 *      with it) and dimmed text inherits full strength. Another 38 declarations
 *      used `--foreground` — an HSL triple — directly as a colour.
 *
 *   2. THE FONT CHAIN. next/font declared `--font-geist-sans` on <body>, while
 *      Tailwind's preflight sets `font-family: var(--font-geist-sans), …` on
 *      <html>. Undefined there, that declaration was invalid, the browser serif
 *      (Times) won, and every surface without a font of its own inherited it —
 *      every legacy page, /login, Planning, Organisation, Agent Detail and the
 *      Spiral. Measured in production on 2026-09-13.
 *
 * The rules below make both failures structural: a token used without a
 * fallback must be defined, a channel token must equal its colour, a shadcn
 * triple is never a colour on its own, and the font variables live where the
 * preflight reads them.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const WEB_ROOT = resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(resolve(WEB_ROOT, rel), 'utf8')
const stripCss = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}

const SOURCES = ['app', 'components', 'lib']
  .flatMap((dir) => walk(resolve(WEB_ROOT, dir)))
  .filter((path) => !path.includes('/lib/qa/'))
const CSS_FILES = SOURCES.filter((path) => path.endsWith('.css'))
const MODULE_FILES = CSS_FILES.filter((path) => path.endsWith('.module.css'))
const TS_FILES = SOURCES.filter((path) => /\.(tsx?|mjs)$/.test(path))
const GLOBALS = stripCss(read('app/globals.css'))
const rel = (path: string) => relative(WEB_ROOT, path)

const AFFECTED = ['ReviewQueue', 'SystemHealth', 'ActivityStream', 'MoneyOverview', 'ContentCenter', 'MarketingReview']

/** Every custom property defined by a stylesheet, a style object or next/font. */
function definedTokens(): Set<string> {
  const defined = new Set<string>()
  for (const file of CSS_FILES) {
    for (const m of stripCss(readFileSync(file, 'utf8')).matchAll(/(?<![\w-])(--[A-Za-z][\w-]*)\s*:/g)) defined.add(m[1])
  }
  for (const file of TS_FILES) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/['"`](--[A-Za-z][\w-]*)['"`]\s*[:,]|setProperty\(\s*['"`](--[A-Za-z][\w-]*)|variable:\s*['"](--[A-Za-z][\w-]*)['"]/g)) {
      defined.add((m[1] ?? m[2] ?? m[3]) as string)
    }
  }
  return defined
}

/** A shadcn theme triple such as `218 100% 98%`, as the channels `rgb()` needs. */
function hslChannels(triple: string): string {
  const [h, s, l] = triple.trim().split(/\s+/).map((v) => parseFloat(v))
  const S = s / 100
  const L = l / 100
  const C = (1 - Math.abs(2 * L - 1)) * S
  const X = C * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = L - C / 2
  const [r, g, b] =
    h < 60 ? [C, X, 0] : h < 120 ? [X, C, 0] : h < 180 ? [0, C, X] : h < 240 ? [0, X, C] : h < 300 ? [X, 0, C] : [C, 0, X]
  return [r, g, b].map((v) => Math.round((v + m) * 255)).join(' ')
}

/** Every innermost block of globals.css as selector + body. */
const BLOCKS = [...GLOBALS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }))

// ─────────────────────────────────────────────────────────────────────────────
// 1 · Tokens
// ─────────────────────────────────────────────────────────────────────────────

describe('global design · every token a stylesheet needs exists', () => {
  it('scans the real stylesheets, including the surfaces that carried the defect', () => {
    expect(CSS_FILES.length).toBeGreaterThanOrEqual(15)
    const names = CSS_FILES.map(rel)
    for (const name of AFFECTED) expect(names).toContain(`components/platform/vnext/${name}.module.css`)
    expect(names).toContain('app/globals.css')
  })

  it('no stylesheet reads a custom property that nothing defines and gives no fallback', () => {
    const defined = definedTokens()
    const offenders: string[] = []
    for (const file of CSS_FILES) {
      for (const m of stripCss(readFileSync(file, 'utf8')).matchAll(/var\(\s*(--[A-Za-z][\w-]*)\s*(,)?/g)) {
        if (!m[2] && !defined.has(m[1])) offenders.push(`${rel(file)}: ${m[1]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('the two restored channel tokens are defined in the global stylesheet', () => {
    expect(GLOBALS).toMatch(/(?<![\w-])--foreground-rgb\s*:/)
    expect(GLOBALS).toMatch(/(?<![\w-])--omnira-violet-rgb\s*:\s*139 92 246\s*;/)
  })

  it('every scope that defines --foreground carries its channels, and they agree', () => {
    const scopes = BLOCKS.filter((b) => /(?<![\w-])--foreground\s*:/.test(b.body))
    expect(scopes.map((b) => b.selector)).toEqual([':root', '.dark', "[data-ui-generation='vnext']"])
    for (const scope of scopes) {
      const foreground = /(?<![\w-])--foreground\s*:\s*([^;]+);/.exec(scope.body)![1]
      const channels = /(?<![\w-])--foreground-rgb\s*:\s*([^;]+);/.exec(scope.body)
      expect(channels, `${scope.selector} has no --foreground-rgb`).not.toBeNull()
      expect(channels![1].trim(), scope.selector).toBe(hslChannels(foreground))
    }
  })

  it('pins the three pairs to their measured values', () => {
    expect(hslChannels('218 100% 98%')).toBe('245 249 255')
    expect(hslChannels('0 0% 96%')).toBe('245 245 245')
    expect(hslChannels('240 10% 3.9%')).toBe('9 9 11')
  })

  it('every Omnira channel token equals the colour it is named after', () => {
    const pairs = [...GLOBALS.matchAll(/(?<![\w-])--(omnira-[a-z-]+)-rgb\s*:\s*(\d+\s+\d+\s+\d+)\s*;/g)]
    expect(pairs.map((p) => p[1])).toEqual(expect.arrayContaining(['omnira-cyan', 'omnira-teal', 'omnira-aqua', 'omnira-violet']))
    for (const [, name, channels] of pairs) {
      const hex = new RegExp(`(?<![\\w-])--${name}\\s*:\\s*#([0-9a-fA-F]{6})\\s*;`).exec(GLOBALS)
      expect(hex, `--${name} has no hex definition`).not.toBeNull()
      const expected = [0, 2, 4].map((i) => parseInt(hex![1].slice(i, i + 2), 16)).join(' ')
      expect(channels.split(/\s+/).join(' '), name).toBe(expected)
    }
  })

  it('no CSS module uses a shadcn HSL triple bare as a colour', () => {
    const bare = /(?<!hsl\()var\(--(background|foreground|card|card-foreground|popover|popover-foreground|primary|primary-foreground|secondary|secondary-foreground|muted|muted-foreground|accent|accent-foreground|destructive|destructive-foreground|border|input|ring)\)/g
    const offenders: string[] = []
    for (const file of MODULE_FILES) {
      for (const m of stripCss(readFileSync(file, 'utf8')).matchAll(bare)) offenders.push(`${rel(file)}: ${m[0]}`)
    }
    expect(offenders).toEqual([])
  })

  it('the Tailwind sidebar colours stay unused while their variables are undefined', () => {
    // tailwind.config.ts declares `hsl(var(--sidebar…))` colours that globals.css never defines.
    // Harmless while no class uses them; the first class that does must bring its tokens.
    const used = TS_FILES.filter((file) => /\b(bg|text|border|ring|fill|stroke|from|via|to)-sidebar(-[a-z-]+)?\b/.test(readFileSync(file, 'utf8')))
    const defined = /(?<![\w-])--sidebar\s*:/.test(GLOBALS)
    expect(defined || used.length === 0, `sidebar colours used in: ${used.map(rel).join(', ')}`).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2 · Font
// ─────────────────────────────────────────────────────────────────────────────

describe('global design · the font chain resolves at the root', () => {
  const LAYOUT = read('app/layout.tsx')
  const CODE = LAYOUT.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const HTML = /<html\b[^>]*>/.exec(CODE)?.[0] ?? ''
  const BODY = /<body\b[^>]*>/.exec(CODE)?.[0] ?? ''

  it('next/font declares the variables the Tailwind theme reads', () => {
    expect(CODE).toMatch(/Inter\(\{\s*variable: '--font-geist-sans'/)
    expect(CODE).toMatch(/JetBrains_Mono\(\{\s*variable: '--font-geist-mono'/)
    const tailwind = read('tailwind.config.ts')
    expect(tailwind).toMatch(/sans: \['var\(--font-geist-sans\)'/)
    expect(tailwind).toMatch(/mono: \['var\(--font-geist-mono\)'/)
  })

  it('declares both variables on <html>, where the preflight sets font-family', () => {
    expect(HTML).toMatch(/\$\{inter\.variable\}/)
    expect(HTML).toMatch(/\$\{jetbrainsMono\.variable\}/)
    expect(HTML).toMatch(/\bdark\b/)
  })

  it('keeps <body> free of them, so there is one place they come from', () => {
    expect(BODY).not.toBe('')
    expect(BODY).not.toMatch(/\.variable/)
  })

  it('nothing rewrites the root element class at runtime, which would strip them', () => {
    const offenders = TS_FILES.filter((file) =>
      /documentElement\.className\s*=|documentElement\.setAttribute\(\s*['"]class['"]/.test(readFileSync(file, 'utf8')))
    expect(offenders.map(rel)).toEqual([])
  })
})
