const assert=require('node:assert/strict')
const fs=require('node:fs'), path=require('node:path'), Module=require('node:module')
const ts=require('typescript'), React=require('react')
const {renderToStaticMarkup}=require('react-dom/server')
const {parse}=require('parse5')
const root=path.resolve(__dirname,'../..')
const dir=path.join(root,'apps/web/app/(office-private)/atlas/office/connect')
assert(fs.existsSync(path.join(dir,'page.tsx')),'Protected Office connection page is missing')
let current=null, calls=0
const cache=new Map()
function load(filename){
 if(cache.has(filename))return cache.get(filename)
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{
  fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}
 }).outputText
 const m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename))
 const original=m.require.bind(m)
 m.require=(id)=>{
  if(id==='@/lib/os/organisation')return {loadOrganisationModel:async()=>{calls++;return current}}
  if(id==='./OfficeConnectionPanel')return load(path.join(dir,'OfficeConnectionPanel.tsx'))
  if(id==='@/lib/atlas/office/connection')return load(path.join(root,'apps/web/lib/atlas/office/connection.ts'))
  return original(id)
 }
 m._compile(code,filename);cache.set(filename,m.exports);return m.exports
}
const page=load(path.join(dir,'page.tsx'))
const nodes=html=>{const result=[];function walk(n){result.push(n);for(const c of n.childNodes??[])walk(c)}walk(parse(html));return result}
const attr=(n,key)=>n.attrs?.find(a=>a.name===key)?.value
;(async()=>{
 assert.equal(page.dynamic,'force-dynamic')
 assert.equal(page.revalidate,0)
 assert.equal(page.metadata.referrer,'no-referrer')
 const publicHtml=renderToStaticMarkup(await page.default())
 assert.equal(calls,1)
 assert(publicHtml.includes('/login'))
 assert(!publicHtml.includes('PRIVATE_AGENT'))
 current={projects:[{id:'11111111-1111-4111-8111-111111111111',name:'Familje-Stunden',slug:'family',
  agents:[{id:'22222222-2222-4222-8222-222222222222',name:'PRIVATE_AGENT',model:'SECRET_MODEL',description:'SECRET_PROMPT'}]}],
  availability:{projects:true,agents:true,activity:true}}
 const html=renderToStaticMarkup(await page.default())
 assert.equal(calls,2)
 assert(!html.includes('SECRET_MODEL')&&!html.includes('SECRET_PROMPT'))
 const all=nodes(html), selects=all.filter(n=>n.tagName==='select')
 assert.equal(selects.length,3,'Avatar, project and agent all need explicit selection')
 for(const select of selects){
  const label=all.find(n=>n.tagName==='label'&&attr(n,'for')===attr(select,'id'))
  assert(label,'Every selection needs an associated label')
  const options=(select.childNodes??[]).filter(n=>n.tagName==='option')
  assert.equal(attr(options[0],'value'),'')
 }
 assert(all.some(n=>n.tagName==='button'&&attr(n,'type')==='button'))
 assert(html.includes('arbetsstatus okänd'))
 assert(!html.includes('röst är live'))
 fs.mkdirSync(path.join(root,'.superpowers/office-launcher-20261112'),{recursive:true})
 fs.writeFileSync(path.join(root,'.superpowers/office-launcher-20261112/connect-render.html'),
  '<!doctype html><html lang="sv" style="--font-geist-sans:Arial;--font-geist-mono:monospace"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/page.css?v=office-connect-2"><body style="margin:0;background:#07111e;color:#fff">'+html+'</body></html>')
 console.log('PASS: connection page authenticates scoped source, strips private agent fields, renders explicit accessible selectors and truthful status.')
})().catch(error=>{console.error(error);process.exitCode=1})
