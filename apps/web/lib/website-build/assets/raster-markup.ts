import {parseFragment,type DefaultTreeAdapterMap} from 'parse5'
import {escapeHtml} from '../preview-runtime'
type Node=DefaultTreeAdapterMap['node']
/** Change only parsed HTML img src attributes; never replace lookalike text/scripts/styles. */
export function mapRasterSources(html:string,replace:(src:string,alt:string)=>string):string{
 if(Buffer.byteLength(html,'utf8')>1048576)throw Error('RASTER_MARKUP_TOO_LARGE')
 const document=parseFragment(html,{sourceCodeLocationInfo:true})
 const edits:{start:number;end:number;value:string}[]=[]
 function walk(nodes:Node[],depth=0):void{
  if(depth>100)throw Error('RASTER_MARKUP_TOO_DEEP')
  for(const node of nodes){
   if(!('tagName' in node))continue
   if(node.tagName==='img'&&node.namespaceURI==='http://www.w3.org/1999/xhtml'){
    const src=node.attrs.find(a=>a.name==='src'),alt=node.attrs.find(a=>a.name==='alt')?.value??''
    if(src){const value=replace(src.value,alt),location=node.sourceCodeLocation?.attrs?.src
     if(value!==src.value){if(!location)throw Error('INVALID_RASTER_LOCATION');edits.push({start:location.startOffset,end:location.endOffset,value:'src="'+escapeHtml(value)+'"'})}
    }
   }
   walk(node.childNodes,depth+1)
  }
 }
 walk(document.childNodes)
 for(const edit of edits.sort((a,b)=>b.start-a.start))html=html.slice(0,edit.start)+edit.value+html.slice(edit.end)
 return html
}
