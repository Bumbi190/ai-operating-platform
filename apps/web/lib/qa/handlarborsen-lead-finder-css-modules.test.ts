import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

const files = [
  '../../components/platform/vnext/HandlarborsenLeadFinder.module.css',
  '../../components/platform/vnext/HandlarborsenScbImportControl.module.css',
]

describe('Handlarbörsen CSS Modules – Next.js pure selectors', () => {
  it.each(files)('%s has no unscoped selectors', relative => {
    const text = readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
    const root = postcss.parse(text)
    const unscoped: string[] = []
    root.walkRules(rule => {
      for (const selector of rule.selector.split(',')) {
        // In these two component stylesheets each selector must contain at
        // least one CSS-module-local class. Naked input/button/select rules
        // caused the initial Vercel Preview build to fail.
        if (!/\.[a-zA-Z_][\w-]*/.test(selector)) unscoped.push(selector.trim())
      }
    })
    expect(unscoped).toEqual([])
  })
  it('keeps keyboard focus visible and scoped to the Lead Finder page', () => {
    const css = readFileSync(fileURLToPath(new URL(files[0], import.meta.url)), 'utf8')
    expect(css).toContain('.page button:focus-visible')
    expect(css).toContain('.page input:focus-visible')
    expect(css).toContain('.page select:focus-visible')
    expect(css).not.toMatch(/(?:^|,)\s*(?:button|input|select):focus-visible/m)
  })
})
