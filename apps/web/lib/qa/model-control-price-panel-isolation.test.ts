import {describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'

const panel=readFileSync(join(process.cwd(),
  'app/model-control-preview/bedrock-price-advisory-panel.tsx'),'utf8')
const page=readFileSync(join(process.cwd(),
  'app/model-control-preview/page.tsx'),'utf8')
const source=readFileSync(join(process.cwd(),
  'lib/ai/model-control/bedrock-price-advisory.ts'),'utf8')
const fx=readFileSync(join(process.cwd(),
  'lib/ai/model-control/bedrock-fx-advisory.ts'),'utf8')

describe('Preview reference price panel isolation',()=>{
  it('is present only as a disclosed advisory panel with dated references',()=>{
    expect(page).toContain('<BedrockPriceAdvisoryPanel/>')
    expect(panel).toContain('Referenspriser och bruttokostnad')
    expect(panel).toContain('Detta är inte ett kontoverifierat fakturapris')
    expect(panel).toContain('AWS Activate-krediter är inte avdragna')
    expect(source).toContain('observedOn')
    expect(source).toContain('accountRateVerified: false')
    expect(source).toContain('publicSkuRatesVerified: true')
    expect(source).toContain('exactRuntimeVersionPriceVerified: false')
    expect(panel).toContain('Riksbankens notering 16 november 2026')
    expect(panel).toContain('+10% är en tänkt marginal')
  })
  it('has no provider or database execution seam or capability to approve budgets',()=>{
    // Comments describe forbidden runtime boundaries; inspect non-comment code.
    const code=(panel+'\n'+source+'\n'+fx)
      .replace(/\/\*[\s\S]*?\*\//g,'')
      .replace(/^\s*\/\/.*$/gm,'')
    expect(code).not.toMatch(/BedrockRuntimeClient|ConverseCommand|InvokeModelCommand/)
    expect(code).not.toMatch(/withGovernedSpend|reserveSpend|createAdminClient|fetch\(/)
    expect(fx).not.toMatch(/import ['\"]server-only['\"]|from ['\"]@\/lib\/cost\/spend-ceiling['\"]|from ['\"]@\/lib\/cost\/governed-spend['\"]/)
    expect(code).toContain('canDispatch: false')
    expect(code).toContain('canonicalBudgetReserved: false')
    expect(code).toContain('creditDeductionUsd: 0')
  })
})
