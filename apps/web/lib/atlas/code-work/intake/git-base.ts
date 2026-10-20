/**
 * Read-only observation of the ONE trusted Omnira GitHub repository and main.
 * This is not SDF-1C repository proof, not a project binding or execution authority.
 * No caller controls URL, branch, owner, repository, headers or credentials.
 */
import 'server-only'
import {OMNIRA_REPOSITORY_ID,lookupTrustedRepository} from '../repository-registry'

export type ObservedGitBase=
 | {ok:true;repositoryId:typeof OMNIRA_REPOSITORY_ID;baseRef:'refs/heads/main';pinnedBaseSha:string}
 | {ok:false;reason:'trusted_git_base_unavailable'}

const SHA=/^[a-f0-9]{40}$/
const ENDPOINT='https://api.github.com/repos/Bumbi190/ai-operating-platform/git/ref/heads/main'
const FAILURE:ObservedGitBase=Object.freeze({ok:false,reason:'trusted_git_base_unavailable'})

/** Performs a fresh, bounded observation on each explicit operator preview.
 * GitHub HTTP replies are untrusted until ref, type and SHA are checked.
 * Do not reuse a response as a long-lived authorization or as worktree proof.
 */
export async function observeTrustedOmniraMain(
 request:typeof fetch=fetch,
):Promise<ObservedGitBase>{
 const repo=lookupTrustedRepository(OMNIRA_REPOSITORY_ID)
 if(!repo||repo.owner!=='Bumbi190'||repo.name!=='ai-operating-platform'||
    repo.approvedBaseRefs.length!==1||repo.approvedBaseRefs[0]!=='refs/remotes/origin/main'){
  return FAILURE
 }
 try{
  const response=await request(ENDPOINT,{
   method:'GET',
   headers:{'Accept':'application/vnd.github+json','User-Agent':'Omnira-CodeWork-ReadOnly'},
   redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000),
  })
  if(!response.ok||response.status!==200)return FAILURE
  const length=response.headers.get('content-length')
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>16_384))return FAILURE
  const data=await response.text()
  if(data.length>16_384)return FAILURE
  const value:unknown=JSON.parse(data)
  if(!value||typeof value!=='object'||Array.isArray(value))return FAILURE
  const obj=value as Record<string,unknown>
  const git=obj.object
  if(obj.ref!=='refs/heads/main'||!git||typeof git!=='object'||Array.isArray(git))return FAILURE
  const target=git as Record<string,unknown>
  if(target.type!=='commit'||typeof target.sha!=='string'||!SHA.test(target.sha))return FAILURE
  return{ok:true,repositoryId:OMNIRA_REPOSITORY_ID,baseRef:'refs/heads/main',pinnedBaseSha:target.sha}
 }catch{return FAILURE}
}
