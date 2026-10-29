/**
 * The Prompt private hybrid-preview input parsing. No provider calls, secrets,
 * database access, publication approval or mutation lives in this module.
 */
export const MAX_HYBRID_PREVIEW_SCENES=5
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type HybridPreviewRefusalCode='invalid_script'|'invalid_scenes'|'invalid_selection'

export class HybridPreviewRefusal extends Error {
  readonly code: HybridPreviewRefusalCode
  constructor(code:HybridPreviewRefusalCode){
    super('HYBRID_PREVIEW_REFUSED')
    this.name='HybridPreviewRefusal'
    this.code=code
  }
}

/**
 * Only the approved Supabase project's PUBLIC media URLs are valid as script
 * inputs. The private video links are minted separately from canonical Asset
 * IDs by the trusted server; a script must never dictate arbitrary fetch URLs.
 */
export function isTrustedPreviewSourceUrl(raw:unknown,configuredSupabaseUrl:unknown):raw is string {
  if(typeof raw!=='string'||raw.length>2048||typeof configuredSupabaseUrl!=='string')
    return false
  try{
    const source=new URL(raw),target=new URL(configuredSupabaseUrl)
    return source.protocol==='https:'&&target.protocol==='https:'&&
      source.origin===target.origin&&
      source.pathname.startsWith('/storage/v1/object/public/media-assets/')&&
      !source.username&&!source.password&&!source.search&&!source.hash
  }catch{return false}
}

export function validatePreviewScriptId(id:unknown):string {
  if(typeof id!=='string'||!UUID.test(id)){
    throw new HybridPreviewRefusal('invalid_script')
  }
  return id
}

/**
 * Requires the EXACT expected number of index-aligned clips. A dash means
 * intentionally retain the existing image in this scene. Unknown parameters
 * and ambiguous duplicate clips are rejected before asset URL signing.
 */
export function parseHybridPreviewSelection(params:URLSearchParams,sceneCount:number):(string|null)[]{
  if(!Number.isInteger(sceneCount)||sceneCount<1||sceneCount>MAX_HYBRID_PREVIEW_SCENES)
    throw new HybridPreviewRefusal('invalid_scenes')
  if([...params.keys()].some(key=>key!=='video_asset_id'))
    throw new HybridPreviewRefusal('invalid_selection')
  const requested=params.getAll('video_asset_id')
  if(requested.length!==sceneCount)throw new HybridPreviewRefusal('invalid_selection')

  const seen=new Set<string>()
  return requested.map((raw):string|null=>{
    if(raw==='-')return null
    if(!UUID.test(raw)||seen.has(raw))throw new HybridPreviewRefusal('invalid_selection')
    seen.add(raw)
    return raw
  })
}
