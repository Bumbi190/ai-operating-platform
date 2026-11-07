import {describe,it,expect} from 'vitest'
import {compileWebsiteArtifact,makePreviewDocument,WebsiteArtifactError} from './artifact'
const body='<label for="fuel">Drivlina</label><select id="fuel"><option value="*">Alla</option><option value="el">El</option><option value="hybrid">Hybrid</option><option value="vatgas">Vätgas</option></select><p id="count" role="status"></p><p id="empty" hidden>Inga träffar</p><article id="one" data-fuel="el">Elbil</article><article id="two" data-fuel="hybrid">Hybridbil</article>'
const filter=()=>({kind:'filter',triggerId:'fuel',targetIds:['one','two'],attribute:'data-fuel',emptyId:'empty',countId:'count'})
const draft=(html=body,behavior:unknown=filter())=>({format:'static-website.v1',title:'Katalog',css:'body{color:#111}',pages:[{key:'index',title:'Lager',bodyHtml:html,behaviors:[behavior]}]})
const config=(html:string)=>JSON.parse(html.match(/<script type="application\/json" id="__atlas_config">([\s\S]*?)<\/script>/)![1])
describe('bounded catalog filter contract',()=>{
 it('compiles explicit static collection data without opening network or script capabilities',()=>{
  const artifact=compileWebsiteArtifact(draft())
  expect(config(artifact.pages[0].html).behaviors).toEqual([filter()])
  expect(artifact.pages[0].html).toContain('connect-src &#39;none&#39;')
  expect(artifact.integrationNeeds).toEqual([])
  expect(config(makePreviewDocument(artifact,'index','test')).behaviors).toEqual([filter()])
 })
 it.each([
  ['attribute selector',{attribute:'[data-fuel]'}],['event attribute',{attribute:'onclick'}],['oversized attribute',{attribute:'data-'+'a'.repeat(50)}],
  ['missing count',{countId:'absent'}],['missing empty',{emptyId:'absent'}],['same status nodes',{emptyId:'count'}],
  ['status is target',{countId:'one'}],['trigger is target',{targetIds:['fuel','two']}],['duplicate target',{targetIds:['one','one']}],
  ['empty targets',{targetIds:[]}],['missing target',{targetIds:['one','absent']}],['code',{script:'alert(1)'}],['url',{url:'https://invalid.example'}],
 ])('refuses %s',(_label,patch)=>{expect(()=>compileWebsiteArtifact(draft(body,{...filter(),...patch}))).toThrow(WebsiteArtifactError)})
 it.each([
  ['not select',body.replace('<select id="fuel">','<div id="fuel">').replace('</select>','</div>')],
  ['multiple select',body.replace('id="fuel"','id="fuel" multiple')],
  ['missing wildcard',body.replace('<option value="*">Alla</option>','')],
  ['missing option value',body.replace('value="el"','')],
  ['unsafe option',body.replace('value="el"','value="el;alert(1)"')],
  ['duplicate option',body.replace('value="hybrid"','value="el"')],
  ['missing category',body.replace('data-fuel="el"','')],
  ['unsafe category',body.replace('data-fuel="el"','data-fuel="https://invalid.example"')],
  ['count contains controls',body.replace('<p id="count" role="status"></p>','<p id="count"><button>Skicka</button></p>')],
  ['control inside target',body.replace('<label for="fuel">','<article id="outer" data-fuel="el"><label for="fuel">').replace('</select>','</select></article>').replace('id="one"','id="other"')],
 ])('refuses malformed markup: %s',(_label,html)=>{expect(()=>compileWebsiteArtifact(draft(html))).toThrow(WebsiteArtifactError)})
 it('refuses actual nesting of the controls inside a filtered item',()=>{
  const nested='<article id="one" data-fuel="el">'+body.replace('<article id="one" data-fuel="el">Elbil</article>','')+'</article>'
  expect(()=>compileWebsiteArtifact(draft(nested))).toThrow(WebsiteArtifactError)
 })
 it('refuses nested targets and a second writer to the same collection',()=>{
  const nested=body.replace('<article id="one" data-fuel="el">Elbil</article>','<article id="one" data-fuel="el">Elbil').replace('</article>','</article></article>')
  expect(()=>compileWebsiteArtifact(draft(nested))).toThrow(WebsiteArtifactError)
  const d=draft(body+'<button id="toggle">Visa</button>')
  d.pages[0].behaviors.push({kind:'toggle',triggerId:'toggle',targetIds:['one']})
  expect(()=>compileWebsiteArtifact(d)).toThrow(WebsiteArtifactError)
 })
 it('retains existing details toggles inside a filtered card',()=>{
  const d=draft(body.replace('Elbil</article>','<button id="details">Detaljer</button><div id="panel" hidden>Bilfakta</div></article>'))
  d.pages[0].behaviors.push({kind:'toggle',triggerId:'details',targetIds:['panel']})
  expect(config(compileWebsiteArtifact(d).pages[0].html).behaviors).toHaveLength(2)
 })
})
