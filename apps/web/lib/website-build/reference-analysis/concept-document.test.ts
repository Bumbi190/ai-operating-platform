import {it,expect} from 'vitest'
import {parse,type DefaultTreeAdapterMap} from 'parse5'
import {staticConceptDocument} from './concept-document'
const document=(body:string)=>'<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src &apos;none&apos;; script-src &apos;sha256-old&apos;"></head><body>'+body+'</body></html>'
function scripts(node:DefaultTreeAdapterMap['node']):number{
 let count='tagName' in node&&node.tagName.toLowerCase()==='script'?1:0
 if('childNodes' in node)count+=node.childNodes.reduce((sum,child)=>sum+scripts(child),0)
 if('tagName' in node&&node.tagName==='template')count+=scripts((node as DefaultTreeAdapterMap['template']).content)
 return count
}
it('removes parsed scripts with whitespace or mixed-case closing tags and preserves visible concept content',()=>{
 const input=document('<script>one()</script ><h1>Behåll innehållet</h1><ScRiPt>two()</sCrIpT\t><p>Synlig text</p><script>three()</script>')
 const output=staticConceptDocument(input)
 expect(scripts(parse(output))).toBe(0)
 expect(output).toContain('<h1>Behåll innehållet</h1>')
 expect(output).toContain('<p>Synlig text</p>')
 expect(output).toContain("script-src 'none'")
 expect(output).not.toContain('sha256-old')
})
it('removes inert template scripts too and fails closed without the compiler CSP',()=>{
 const output=staticConceptDocument(document('<template><script>inactive()</script ></template><h1>Koncept</h1>'))
 expect(scripts(parse(output))).toBe(0)
 expect(()=>staticConceptDocument('<h1>Saknar kompilerad CSP</h1>')).toThrow()
})
