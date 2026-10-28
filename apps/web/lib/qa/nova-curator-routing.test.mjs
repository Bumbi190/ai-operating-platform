/**
 * Pure intent + source-integration regression for the observed owner screenshot.
 * No credentials, app dependencies, network, source documents or CRM calls.
 * node --no-warnings --experimental-strip-types --test apps/web/lib/qa/nova-curator-routing.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {dirname,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {isPendingNovaCuratorRequest, NOVA_CURATOR_NOT_CONNECTED_REPLY} from
  '../atlas/source-curator/pending-review-intent.ts'
import {isHandlarborsenEvidenceComparisonIntent} from
  '../atlas/project-analytics/handlarborsen-evidence-intent.ts'
import {classifyHandlarborsenReadIntent} from
  '../atlas/project-analytics/handlarborsen-tool-intent.ts'

const here=dirname(fileURLToPath(import.meta.url))
const route=readFileSync(resolve(here,'../../app/api/chat/route.ts'),'utf8').replace(/\r\n?/g,'\n')
const screenshot='Nova, granska Handlarbörsens kunskapskällor och visa mig vilka beslut du behöver från mig.'

test('the exact operator screenshot is recognized as an unavailable specialist request', () => {
  assert.equal(isPendingNovaCuratorRequest(screenshot),true)
})
test('the screenshot is NOT a composite CRM comparison or CRM read', () => {
  assert.equal(isHandlarborsenEvidenceComparisonIntent(screenshot),false)
  assert.equal(classifyHandlarborsenReadIntent(screenshot),null)
})
test('recognizes a narrowly scoped Nova request about Handlarbörsen knowledge documents', () => {
  assert.equal(isPendingNovaCuratorRequest('Nova, kontrollera Handlarbörsens kunskapsdokument.'),true)
})
test('recognizes a source-curation request with a greeting', () => {
  assert.equal(isPendingNovaCuratorRequest('Hej Nova, förhandsgranska Handlarbörsens projektkunskap.'),true)
})
test('recognizes a deliberate Atlas-to-Nova handoff', () => {
  assert.equal(isPendingNovaCuratorRequest('Atlas, be Nova granska Handlarbörsens kunskapskällor.'),true)
})
test('recognizes explicit source-curator phrase', () => {
  assert.equal(isPendingNovaCuratorRequest('Nova, kontrollera Handlarbörsens Source Curator-källor.'),true)
})
test('does not intercept an explicit negation', () => {
  assert.equal(isPendingNovaCuratorRequest('Nova, granska inte Handlarbörsens kunskapskällor.'),false)
})
test('does not intercept an unrelated CRM or email review', () => {
  assert.equal(isPendingNovaCuratorRequest('Nova, granska Handlarbörsens CRM-inkorg.'),false)
})
test('does not steal other projects source-review requests', () => {
  assert.equal(isPendingNovaCuratorRequest('Nova, granska Familje-Stundens kunskapskällor.'),false)
})
test('does not steal generic project documentation without a specialist command', () => {
  assert.equal(isPendingNovaCuratorRequest('Vad står i Handlarbörsens kunskapsdokument?'),false)
})
test('does not intercept meta questions quoting the command', () => {
  assert.equal(isPendingNovaCuratorRequest('Varför valde Nova fel verktyg när jag sa "granska Handlarbörsens kunskapskällor"?'),false)
})
test('does not intercept incomplete generic Nova addresses', () => {
  assert.equal(isPendingNovaCuratorRequest('Nova, granska Handlarbörsen.'),false)
})
test('does not infer permission from untrusted non-string data', () => {
  assert.equal(isPendingNovaCuratorRequest(null),false)
  assert.equal(isPendingNovaCuratorRequest({text:screenshot}),false)
  assert.equal(isPendingNovaCuratorRequest(['Nova', 'granska']),false)
})
test('bounded request length rejects unusually long text', () => {
  assert.equal(isPendingNovaCuratorRequest(screenshot + 'x'.repeat(1400)),false)
})
test('the unavailable answer never claims the work was performed', () => {
  assert.match(NOVA_CURATOR_NOT_CONNECTED_REPLY,/ännu inte ansluten/)
  assert.match(NOVA_CURATOR_NOT_CONNECTED_REPLY,/inte granskat/)
  assert.match(NOVA_CURATOR_NOT_CONNECTED_REPLY,/Ingen publicering/)
})
test('the guard is installed on the real chat turn, not only a helper', () => {
  assert.match(route,/const pendingNovaCuratorReview = [^\n]*!image[\s\S]{0,250}isPendingNovaCuratorRequest\(lastUserText\)/)
})
test('the tool allowlist is empty while the specialist is unavailable', () => {
  assert.match(route,/const activeTools = pendingNovaCuratorReview \? \[\] : notionReadOnlyTurn/)
})
test('other special routing is excluded during an unavailable knowledge review', () => {
  for (const name of ['hbCompositeEvidenceIntent','externalReferenceReadIntent',
    'hbSalesOverviewReadIntent','hbReplyLifecycleReadIntent','fastPath',
    'resolutionIntent','actionIntent','navIntent','hbReadIntent','notionReadOnlyTurn']) {
    assert.match(route,new RegExp('const ' + name + ' = !pendingNovaCuratorReview'),name)
  }
  assert.match(route,/!pendingNovaCuratorReview && !image && !studioContext && !fastPath && !websitePlanRef/)
})
test('the pending turn bypasses all live-context and model source reads', () => {
  assert.match(route,/else if \(pendingNovaCuratorReview\) \{[\s\S]{0,200}systemPrompt = ''[\s\S]{0,100}\} else if\(studioContext\)/)
  const explicitReply=route.indexOf('if (pendingNovaCuratorReview) {\n        send')
  const modelRun=route.indexOf('async function runConversation(')
  assert.ok(explicitReply > 0 && modelRun > explicitReply)
  const turn=route.slice(explicitReply,modelRun)
  assert.match(turn,/send\('text', \{ text: NOVA_CURATOR_NOT_CONNECTED_REPLY \}\)/)
  assert.match(turn,/send\('done', \{\}\)/)
  assert.match(turn,/controller\.close\(\)\s+return/)
  assert.doesNotMatch(turn,/executeTool\(|get_handlarborsen_strato_inbox|handlarborsen_compare_workflow_evidence/)
})
test('the early deterministic branch requires a real user turn and does not activate the curator', () => {
  assert.match(route,/const lastUserText = \(\(\) => \{\s+const m = messages\[messages.length - 1\]/)
  assert.doesNotMatch(route,/from ['"]@\/lib\/atlas\/source-curator\/review['"]/)
  assert.doesNotMatch(route,/ATLAS_SOURCE_CURATOR_MODE|ATLAS_OPENVIKING_MODE\s*=/)
})

test('natural-language ownership phrasing also stays away from CRM', () => {
  assert.equal(isPendingNovaCuratorRequest(
    'Jag vill att Nova ska granska Handlarbörsens kunskapskällor och sammanfatta riskerna.'
  ),true)
  assert.equal(isPendingNovaCuratorRequest(
    'Nova, jag vill att du granskar Handlarbörsens kunskapsdokument.'
  ),true)
})
test('a document review mixed with a sending request still cannot invoke outgoing tools', () => {
  assert.equal(isPendingNovaCuratorRequest(
    'Nova, granska Handlarbörsens kunskapskällor och skicka ett mejl till alla.'
  ),true)
})
