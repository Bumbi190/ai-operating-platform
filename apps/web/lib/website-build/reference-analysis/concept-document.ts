import 'server-only'
import {parse,serialize,type DefaultTreeAdapterMap} from 'parse5'
import {websiteCsp} from '../preview-runtime'
/**
 * Static presentation of already compiler-validated concept HTML.
 * This is not a general sanitizer: untrusted markup must still pass the compiler.
 * Parse the document so HTML closing-tag variants cannot defeat runtime removal.
 */
export function staticConceptDocument(html:string):string{
 const document=parse(html)
 let policies=0
 function visit(node:DefaultTreeAdapterMap['node']):void{
  if('tagName' in node){
   if(node.tagName==='meta'&&node.attrs.some(a=>a.name==='http-equiv'&&a.value.toLowerCase()==='content-security-policy')){
    const content=node.attrs.find(a=>a.name==='content')
    if(!content)throw Error('CONCEPT_CSP_MISSING')
    content.value=websiteCsp("'none'");policies++
   }
   if(node.tagName==='template')visit((node as DefaultTreeAdapterMap['template']).content)
  }
  if('childNodes' in node){
   node.childNodes=node.childNodes.filter(child=>!('tagName' in child&&child.tagName.toLowerCase()==='script'))
   for(const child of node.childNodes)visit(child)
  }
 }
 visit(document)
 if(!policies)throw Error('CONCEPT_CSP_MISSING')
 return serialize(document)
}
