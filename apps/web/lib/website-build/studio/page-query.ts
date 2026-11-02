/**
 * Browser links can arrive with marketing attribution parameters.
 * These are not Studio selectors. Strip only documented tracking keys on
 * the rendered page; API selectors stay strict and reject unknown keys.
 */
const TRACKING_PARAM=/^utm_(?:source|medium|campaign|term|content|id)$/

export function studioPageQuery(input:Record<string,string|string[]|undefined>):URLSearchParams{
 const query=new URLSearchParams()
 for(const [key,value] of Object.entries(input)){
  if(TRACKING_PARAM.test(key))continue
  if(Array.isArray(value)){for(const item of value)query.append(key,item)}
  else if(value!==undefined)query.set(key,value)
 }
 return query
}
