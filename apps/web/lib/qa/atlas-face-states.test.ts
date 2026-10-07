/**
 * Atlas Home · Phase C — the face's living states.
 *
 * The face responds to Atlas's runtime state and to nothing else. These are
 * source contracts (vitest runs in `environment: node`), asserting the facts
 * that would each mean the states had become something other than approved:
 *
 *   1. the seven canonical states are the only vocabulary, read from the one
 *      runtime owner, and the face never computes, times or cycles one;
 *   2. the review preview is development-only and changes only what is drawn;
 *   3. every state has a static signature, so it survives reduced motion;
 *   4. reduced motion covers every new animated layer;
 *   5. the face image is re-lit, never moved.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ATLAS_ORB_STATES, ATLAS_ORB_VISUAL_PARAMETERS } from '@/lib/atlas/orb-state'

const WEB_ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), 'utf8')

const FACE = read('components/platform/vnext/AtlasFace.tsx')
const CORE = read('components/platform/vnext/AtlasCommandCore.tsx')
const CSS = read('components/platform/vnext/AtlasHomeVNext.module.css')

const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('state truth · one owner, no second state machine', () => {
  it('uses exactly the seven canonical states', () => {
    expect([...ATLAS_ORB_STATES]).toEqual([
      'idle', 'listening', 'thinking', 'speaking', 'executing', 'awaiting_approval', 'warning',
    ])
  })

  it('the face is handed its state and never derives or reads the runtime', () => {
    const face = codeOnly(FACE)
    expect(face).toMatch(/function AtlasFace\(\{ state \}: \{ state: AtlasOrbState \}\)/)
    for (const forbidden of ['resolveAtlasOrbState', 'useAtlas', 'voicePhase', 'useState', 'useReducer']) {
      expect(face, forbidden).not.toContain(forbidden)
    }
  })

  it('the face reads its intensities from the canonical per-state table', () => {
    expect(FACE).toContain('ATLAS_ORB_VISUAL_PARAMETERS[state]')
    for (const state of ATLAS_ORB_STATES) {
      expect(ATLAS_ORB_VISUAL_PARAMETERS[state], state).toBeDefined()
    }
  })

  it('nothing on the face side can advance a state over time', () => {
    for (const [name, src] of [['AtlasFace', FACE], ['AtlasCommandCore', CORE]] as const) {
      expect(codeOnly(src), name).not.toMatch(/setInterval|setTimeout|requestAnimationFrame/)
    }
  })

  it('the command core still resolves state from the live runtime', () => {
    expect(CORE).toContain('resolveAtlasOrbState({')
    expect(CORE).toContain('voicePhase: atlas.voicePhase')
    expect(CORE).toContain('<AtlasFace state={orbState} />')
  })
})

describe('review preview · development only, drawing only', () => {
  it('both preview parameters are gated on a development build', () => {
    expect(CORE).toMatch(/process\.env\.NODE_ENV === 'development'\s*\?\s*searchParams\.get\('orbPreview'\)\s*:\s*null/)
    expect(CORE).toMatch(/process\.env\.NODE_ENV === 'development' \? searchParams\.get\('orbAudio'\) : null/)
  })

  it('a preview only replaces the drawn state — it is never written back to the runtime', () => {
    const core = codeOnly(CORE)
    expect(core).not.toMatch(/atlas\.(setVoicePhase|setExecution|setWarning|activate)\(\s*previewState/)
    expect(core).toContain('isAtlasOrbState(previewState) ? previewState : runtimeOrbState')
  })

  it('renders no operator-facing state control', () => {
    // The prototype's "Tillståndsdemo" chips are demo controls, not product.
    expect(CORE).not.toContain('Tillståndsdemo')
    expect(CORE).not.toMatch(/onClick=\{\(\) => set\w*State/)
  })
})

describe('reduced motion · every state is distinguishable without animation', () => {
  // A state's static signature: a non-animation declaration under its own
  // data-state selector. Idle's signature is the absence of a ring at its
  // lowest energy, which the shared rules give it.
  const STATIC_PROPS = /(opacity|border-style|border-color|border-width|filter|stroke)\s*:/

  it.each(ATLAS_ORB_STATES.filter((s) => s !== 'idle'))('%s has a static signature', (state) => {
    const rules = [...CSS.matchAll(new RegExp(`\\.faceStage\\[data-state='${state}'\\][^{]*\\{([^}]*)\\}`, 'g'))]
    const staticRule = rules.find(([, body]) => STATIC_PROPS.test(body.replace(/animation[^;]*;/g, '')))
    expect(staticRule, `${state} must change something other than motion`).toBeTruthy()
  })

  it('the canonical energies differ, so glow and face light differ per state', () => {
    const energies = ATLAS_ORB_STATES.map((s) => ATLAS_ORB_VISUAL_PARAMETERS[s].energy)
    expect(new Set(energies).size).toBe(energies.length)
  })

  it('every new animated layer is covered by the reduced-motion block', () => {
    const block = CSS.slice(CSS.indexOf('@media (prefers-reduced-motion: reduce)'))
    for (const layer of ['.orbitFlow', '.spark', '.faceCoreGlow', '.faceCoreRing', '.faceCoreWave']) {
      expect(block, layer).toContain(`:where(html:not([data-motion='full'])) ${layer}`)
    }
  })

  it('approval is held, not merely slow: its loops are paused', () => {
    expect(CSS).toMatch(/\.faceStage\[data-state='awaiting_approval'\] \.orbitFlow,[\s\S]{0,120}animation-play-state: paused/)
  })
})

describe('identity · the face is re-lit, never moved', () => {
  it('no animation, and no transform beyond static centring, ever targets the face image', () => {
    const imageRules = [...CSS.matchAll(/\.faceImage[^{]*\{([^}]*)\}/g)].map(([, body]) => body)
    for (const body of imageRules) {
      // `animation: none` (the reduced-motion block) is the only allowed value.
      for (const [, value] of body.matchAll(/animation\s*:\s*([^;]+);/g)) {
        expect(value.trim()).toBe('none')
      }
      // The mobile column centres the face statically; nothing scales,
      // rotates or moves it in any state.
      for (const [, value] of body.matchAll(/transform\s*:\s*([^;]+);/g)) {
        expect(value.trim()).toBe('translateX(-50%)')
      }
    }
  })

  it('warning is an accent, not an error screen', () => {
    const warning = [...CSS.matchAll(/\[data-state='warning'\][^{]*\{([^}]*)\}/g)].map(([, b]) => b).join('\n')
    expect(warning).not.toMatch(/#ef4444|#dc2626|rgb\(239 68 68|rgba\(239, 68, 68/)
  })
})
