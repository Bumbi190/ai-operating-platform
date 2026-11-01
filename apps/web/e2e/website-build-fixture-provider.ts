import { createAdminClient } from './website-build-fixture-db'
import { testSql } from '../lib/website-build/test-db'
import { loadBuildSnapshot } from '../lib/website-build/store'
let template: 'default' | 'tabs' | 'forms' | 'anchors' = 'default'
export function setFixtureTemplate(value: typeof template) { template = value }
export async function runStep(input: { runId: string; cost: { operation: string }; userMessage?: string }) {
  if (!/^[0-9a-f-]{36}$/.test(input.runId)) throw Error('Invalid fixture run')
  const writer = JSON.parse(testSql(`select jsonb_build_object('projectId',s.project_id,'sessionId',s.id,'runId',r.id,'claimId',r.claim_id,'generation',s.generation) from website_build_sessions s join runs r on r.id=s.current_run_id where r.id='${input.runId}';`))
  const snapshot = await loadBuildSnapshot(createAdminClient(), writer)
  const text = snapshot.feedback.at(-1)?.text || 'Välkommen till vårt café'
  if(snapshot.brief.includes('premium-dealer-demo-v1')&&snapshot.designReference){
    // Exercise the actual worker's compact request and output resolver, not a bypass commit.
    const request=JSON.parse(input.userMessage??'{}')
    if(input.userMessage?.includes('base64,')||request.assets?.length!==17)throw Error('Invalid showroom fixture media input')
    let output:unknown
    if(input.cost.operation.includes('interpret'))output={items:snapshot.feedback.map(item=>({feedbackId:item.id,summary:'Ändrar endast accentfärgen och bevarar bilderna.',disposition:'apply',changeKey:'theme.accent',supersedesFeedbackIds:[]}))}
    else{
      if(!request.designReference?.draft)throw Error('Reviewed showroom draft missing from actual worker input')
      const source=structuredClone(request.designReference.draft)
      if(snapshot.feedback.length){
        if(!snapshot.feedback.every(item=>item.text.includes('#71d7ba')))throw Error('Unsupported authored fixture edit')
        source.css=source.css.replaceAll('#efb563','#71d7ba')
      }
      output=source
    }
    return {content:JSON.stringify(output),tokensIn:0,tokensOut:0,durationMs:1,authorityRefreshRequired:false}
  }
  const content: Record<string, unknown> = input.cost.operation.includes('interpret') ? { items: snapshot.feedback.map(item => ({ feedbackId: item.id, summary: 'Jag ändrar hemsidan: ' + item.text, disposition: 'apply', changeKey: 'title', supersedesFeedbackIds: [] })) } : { format: 'static-website.v1', title: 'Café', pages: [
    { key: 'index', title: 'Hem', bodyHtml: `<h1>${text.replace(/[<>&]/g, '')}</h1><button id="menu" aria-expanded="false">Meny</button><nav id="nav" hidden><a href="/contact">Kontakt</a></nav>`, css: 'body{font-family:system-ui;padding:32px;background:#fff8ef}h1{font-size:42px}button{padding:12px}', behaviors: [{ kind: 'toggle', triggerId: 'menu', targetIds: ['nav'] }] },
    { key: 'contact', title: 'Kontakt', bodyHtml: '<h1>Kontakta caféet</h1><a href="/">Hem</a>', css: 'body{font-family:system-ui;padding:32px}', behaviors: [] },
  ] }
  if ('pages' in content && template === 'tabs') content.pages = [{ key: 'index', title: 'Två flikgrupper', bodyHtml: '<div><button id="a1">A1</button><button id="a2">A2</button><section id="pa1">Första A</section><section id="pa2" hidden>Andra A</section></div><div><button id="b1">B1</button><button id="b2">B2</button><section id="pb1">Första B</section><section id="pb2" hidden>Andra B</section></div>', css: '', behaviors: [
    { kind: 'tabs', triggerId: 'a1', targetIds: ['pa1'], groupId: 'a' }, { kind: 'tabs', triggerId: 'a2', targetIds: ['pa2'], groupId: 'a' }, { kind: 'tabs', triggerId: 'b1', targetIds: ['pb1'], groupId: 'b' }, { kind: 'tabs', triggerId: 'b2', targetIds: ['pb2'], groupId: 'b' },
  ] }]
  if ('pages' in content && template === 'forms') content.pages = [{ key: 'index', title: 'Kontaktformulär', bodyHtml: '<form><input type="text" name="name"><button>Skicka</button></form>', css: '[role=note]{display:none}', behaviors: [] }]
  if ('pages' in content && template === 'anchors') content.pages = [{ key: 'index', title: 'Sektionslänkar', bodyHtml: '<a href="#lower">Till sektionen</a><div style="height:1800px"></div><h2 id="lower">Nedre sektionen</h2><a href="#">Till toppen</a>', css: 'body{padding:20px}', behaviors: [] }]
  if(Array.isArray(content.pages)&&snapshot.designReference?.approvedPages?.some(page=>page.key==='contact')&&!content.pages.some(page=>page.key==='contact'))content.pages.push({key:'contact',title:'Kontakt',bodyHtml:'<h1>Kontakta caféet</h1><a href="/">Hem</a>',css:'',behaviors:[]})
  return { content: JSON.stringify(content), tokensIn: 0, tokensOut: 0, durationMs: 1, authorityRefreshRequired: false }
}
