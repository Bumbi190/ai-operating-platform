export type ProspectDesign = {version:1;inputSha256:string;city:string;websiteUrl:string;sections:{heading:string;body:string}[]}
export function parseProspectDesign(value: unknown): ProspectDesign {
  const v=value as ProspectDesign
  const text=(x:unknown,max:number)=>typeof x==='string'&&x.length>0&&x.length<=max&&!/[\u0000-\u001f<>]/.test(x)
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!=='city,inputSha256,sections,version,websiteUrl'||v.version!==1||!/^[a-f0-9]{64}$/.test(v.inputSha256)||!text(v.city,120)||!text(v.websiteUrl,2048)||!Array.isArray(v.sections)||v.sections.length!==3)throw Error('INVALID_PROSPECT_DESIGN')
  const url=new URL(v.websiteUrl)
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.port)throw Error('INVALID_PROSPECT_DESIGN')
  for(const section of v.sections)if(!section||Object.keys(section).sort().join(',')!=='body,heading'||!text(section.heading,100)||!text(section.body,360))throw Error('INVALID_PROSPECT_DESIGN')
  return {version:1,inputSha256:v.inputSha256,city:v.city,websiteUrl:v.websiteUrl,sections:v.sections.map(s=>({heading:s.heading,body:s.body}))}
}
