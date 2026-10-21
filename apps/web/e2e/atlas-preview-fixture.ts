import type {BuildSessionView,WebsiteArtifact} from '../lib/website-build/types'

// Inert local fixture served only through Playwright's read-only API routes.
const pages=[{key:'index',title:'Hem'},{key:'policy',title:'Policy'},{key:'order-confirm',title:'Order'}]
export const previewArtifact:WebsiteArtifact={
 format:'static-website.v1',sha256:'a'.repeat(64),files:[],integrationNeeds:[],
 pages:pages.map(p=>({...p,html:`<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content=""><style>body{margin:0;padding:24px;background:#111;color:#eee;font:18px system-ui}nav{display:flex;gap:16px}a{color:#dfbd76}input{font:inherit;max-width:100%}.spacer{height:1200px}</style></head><body><nav>${pages.map(link=>'<a href="'+link.key+'.html">'+link.title+'</a>').join('')}</nav><h1>${p.title}</h1><label>Testanteckning <input aria-label="Testanteckning"></label><div class="spacer"></div><p>Sidans slut</p><script type="application/json" id="__atlas_config">${JSON.stringify({behaviors:[],pages:pages.map(p=>p.key)})}</script><script id="__atlas_runtime"></script></body></html>`}))
}
export const previewSession:BuildSessionView={
 projectId:'10000000-0000-4000-8000-000000000001',sessionId:'20000000-0000-4000-8000-000000000001',
 stateVersion:1,conversationId:'30000000-0000-4000-8000-000000000001',status:'ready',stage:'Previewversionen är klar',
 agentId:'40000000-0000-4000-8000-000000000001',activePreviewRevisionId:'50000000-0000-4000-8000-000000000001',
 currentRunId:null,controlRequested:null,updatedAt:'2026-10-16T04:30:00Z',feedback:[],
 revisions:[{id:'50000000-0000-4000-8000-000000000001',number:1,generation:1,feedbackSequence:0,sha256:previewArtifact.sha256,createdAt:'2026-10-16T04:30:00Z',pages}]
}
