import 'server-only'
import {WebsiteBuildPermanentError} from '../feedback-interpretation'
import type {DesignReference,WebsiteArtifact} from '../types'
export function approvedWebsitePageKeys(reference:DesignReference|null|undefined):string[]|null{
 if(!reference)return null
 const pages=reference.approvedPages
 if(!Array.isArray(pages)||!pages.length||pages.length>8||pages.some(page=>!page||typeof page.key!=='string'||!/^[a-z][a-z0-9-]{0,49}$/.test(page.key)))throw new WebsiteBuildPermanentError('INVALID_DESIGN_REFERENCE')
 const homeAlias=!pages.some(page=>page.key==='index')&&pages.some(page=>page.key==='home')
 const keys=pages.map(page=>homeAlias&&page.key==='home'?'index':page.key)
 if(!keys.includes('index')||new Set(keys).size!==keys.length)throw new WebsiteBuildPermanentError('INVALID_DESIGN_REFERENCE')
 return keys
}
export function assertApprovedWebsiteScope(artifact:WebsiteArtifact,reference:DesignReference|null|undefined):void{
 const expected=approvedWebsitePageKeys(reference)
 if(expected&&(artifact.pages.length!==expected.length||expected.some(key=>!artifact.pages.some(page=>page.key===key))))throw new WebsiteBuildPermanentError('APPROVED_PAGE_SCOPE_MISMATCH','Byggsvaret måste innehålla samtliga '+expected.length+' godkända sidor. Ingen automatisk betald omkörning görs.')
}
