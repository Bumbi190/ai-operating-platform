import type {SocialLaunchPrincipal} from '../types'
import type {SocialContentAsset} from '../content/types'
export type SocialProfileInput={description:string;audience:string;tone:string;websiteUrl:string|null;callToAction:string;factualBoundaries:string;preferredMediaIds:string[]}
export type SocialProfileRevision={id:string;sequence:number;sha256:string;profile:SocialProfileInput;createdAt:string}
export type SocialProfileView={project:{id:string;name:string;slug:string};revision:SocialProfileRevision|null;assets:SocialContentAsset[];hasMoreAssets:boolean;workspaceUrl:string}
export type SocialProfilePrincipal=SocialLaunchPrincipal
export type SocialProfileSave={projectId:string;conversationId?:string|null;expectedRevisionId:string|null;idempotencyKey:string;profile:SocialProfileInput}
export class SocialProfileError extends Error{
 constructor(public code:'NOT_FOUND'|'INVALID_BODY'|'REVISION_CONFLICT'|'STOPPED'|'UNAVAILABLE'){super(code)}
 get status(){return this.code==='NOT_FOUND'?404:this.code==='INVALID_BODY'?400:this.code==='STOPPED'?423:this.code==='REVISION_CONFLICT'?409:503}
}
