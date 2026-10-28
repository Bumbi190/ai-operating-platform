/**
 * Omnira ordinary Git/PR preflight. Read-only; never creates branches.
 * SDF-1's signed, pinned, locked per-work-ID sandbox stays unchanged.
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const STOP = new Set(['and','the','for','from','with','that','this','och','eller','att','som',
  'innan','efter','till','fran','med','new','create','creating','existing','project',
  'task','change','work','feature','fix','code','kod','projekt','implement',
  'atlas','omnira','github','pull','request','agent'])
const GITHUB_REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const BRANCH = /^[A-Za-z0-9][A-Za-z0-9/_.-]{2,140}$/
const WORK_ID = /^[A-Za-z0-9_-]{2,80}$/

export function words(value) {
  return new Set((String(value || '').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-z0-9]{4,}/g) || [])
    .filter((x) => !STOP.has(x)))
}
const shared = (a,b) => [...a].filter((word) => b.has(word)).length
const printable = (s) => String(s || '').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,140)

export function githubRemote(value) {
  const input=String(value||'').trim().replace(/\.git$/i,'')
  const m=input.match(/^(?:https?:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([^/:\s]+\/[^/:\s]+)$/i)
  return m?m[1].toLowerCase():null
}
export function readWorktrees(porcelain) {
  return String(porcelain||'').replace(/\r/g,'').split(/\n\s*\n/)
    .filter(Boolean).map(block=>{
      const lines=block.split('\n')
      const get=(prefix)=>lines.find(line=>line.startsWith(prefix))?.slice(prefix.length)||null
      return {path:get('worktree '),branch:get('branch refs/heads/'),
        locked:lines.some(line=>line==='locked'||line.startsWith('locked '))}
    }).filter(item=>item.path)
}
export function assessPreflight({prs,worktrees=[],localBranches=[],project,task,workId,proposedBranch,reason,reusePr=null}) {
  const empty={candidates:[],worktreeMatches:[],branchMatches:[]}
  if(!Array.isArray(prs)||prs.length>=500) return {decision:'review_required',code:'incomplete_pr_inventory',...empty}
  if(typeof task!=='string'||task.trim().length<10||typeof project!=='string'||project.trim().length<2||
    !WORK_ID.test(workId)||!BRANCH.test(proposedBranch)||proposedBranch.includes('..')||proposedBranch.includes('//'))
    return {decision:'review_required',code:'invalid_work_identity',...empty}
  if(prs.some(p=>!Number.isSafeInteger(p.number)||typeof p.title!=='string'||typeof p.headRefName!=='string'))
    return {decision:'review_required',code:'invalid_pr_inventory',...empty}
  if(reusePr!==null) {
    const p=prs.find(p=>p.number===reusePr)
    return p?{decision:'reuse_existing',code:'explicit_existing_pr',
      candidates:[{number:p.number,title:printable(p.title),head:p.headRefName,url:p.url}],worktreeMatches:[],branchMatches:[]}
      :{decision:'review_required',code:'requested_pr_not_open',...empty}
  }
  const tokens=words(task)
  const marker=new RegExp('(?:^|\\n)\\s*(?:work[- ]?id|task[- ]?id)\\s*:\\s*'+workId+'(?=\\s|$)','i')
  const candidates=prs.filter(p=>shared(tokens,words(p.title+' '+p.headRefName))>=2||
    marker.test(p.body||'')).map(p=>({number:p.number,title:printable(p.title),head:p.headRefName,url:p.url}))
  const names=new Set([...localBranches,...worktrees.map(x=>x.branch).filter(Boolean)])
  const branchMatches=[...names].filter(x=>x!==proposedBranch&&shared(tokens,words(x))>=2).slice(0,25)
  const worktreeMatches=worktrees.filter(x=>x.branch===proposedBranch||
    (x.branch&&branchMatches.includes(x.branch))).map(x=>({branch:x.branch,path:x.path,locked:x.locked}))
  const collision=names.has(proposedBranch)
  const validReason=typeof reason==='string'&&reason.trim().length>=25
  const decision=candidates.length||branchMatches.length||worktreeMatches.length||collision||!validReason?
    'review_required':'new_branch_approved'
  const code=candidates.length?'matching_open_pr':collision||branchMatches.length||worktreeMatches.length?
    'matching_local_branch':!validReason?'missing_reason':'no_matching_work'
  return {decision,code,candidates,branchMatches,worktreeMatches}
}
function parse(argv) {
  const allowed=new Set(['repo','project','task','work-id','branch','reason','reuse-pr','receipt'])
  const opts={}
  for(let i=0;i<argv.length;i+=2) {
    const key=argv[i]?.replace(/^--/,'')
    if(!argv[i]?.startsWith('--')||!allowed.has(key)||!argv[i+1]||opts[key]!==undefined)
      throw Error('Invalid, missing or repeated option '+printable(argv[i]))
    opts[key]=argv[i+1]
  }
  for(const key of ['repo','project','task','work-id','branch']) if(!opts[key])throw Error('Missing --'+key)
  if(!GITHUB_REPO.test(opts.repo))throw Error('Invalid --repo')
  if(!opts.receipt)throw Error('Missing --receipt; durable evidence is required')
  if(opts['reuse-pr']&&!/^[1-9][0-9]*$/.test(opts['reuse-pr']))throw Error('Invalid --reuse-pr')
  return opts
}
function command(executable,args,cwd) {
  return execFileSync(executable,args,{cwd,encoding:'utf8',timeout:30000,maxBuffer:15*1024*1024}).trim()
}
function main() {
  const cwd=process.cwd()
  const opts=parse(process.argv.slice(2))
  const localRepo=githubRemote(command('git',['remote','get-url','origin'],cwd))
  if(localRepo!==opts.repo.toLowerCase())throw Error('Origin does not match the requested repo')
  command('git',['check-ref-format','--branch',opts.branch],cwd)
  const mainSha=command('git',['rev-parse','origin/main'],cwd)
  const remoteSha=command('git',['ls-remote','--heads','origin','main'],cwd).split(/\s+/)[0]
  if(!/^[0-9a-f]{40}$/.test(mainSha)||mainSha!==remoteSha)
    throw Error('origin/main is stale or unavailable: fetch first')
  const prs=JSON.parse(command('gh',['pr','list','--repo',opts.repo,'--state','open','--limit','500',
    '--json','number,title,body,headRefName,baseRefName,url,isDraft'],cwd))
  const worktrees=readWorktrees(command('git',['worktree','list','--porcelain'],cwd))
  const localBranches=command('git',['branch','--list','--format=%(refname:short)'],cwd)
    .split(/\r?\n/).filter(Boolean)
  const result=assessPreflight({prs,worktrees,localBranches,project:opts.project,task:opts.task,
    workId:opts['work-id'],proposedBranch:opts.branch,reason:opts.reason||'',
    reusePr:opts['reuse-pr']?Number(opts['reuse-pr']):null})
  const receipt={schemaVersion:1,checkedAt:new Date().toISOString(),repository:opts.repo,
    project:opts.project,task:opts.task,workId:opts['work-id'],proposedBranch:opts.branch,
    mainSha,openPrCount:prs.length,worktreeCount:worktrees.length,
    ...result,reason:opts.reason||'',
    limitations:'Metadata/local-name similarity is a hint; review actual file scope and agent ownership before new work.',
    sideEffects:'None. No branch, worktree, PR, commit, deployment or API mutation is performed.'}
  if(opts.receipt)writeFileSync(resolve(opts.receipt),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'})
  console.log(JSON.stringify(receipt,null,2))
  process.exitCode=receipt.decision==='new_branch_approved'?0:2
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{main()}catch(error){console.error(JSON.stringify({decision:'blocked_error',error:String(error.message||error)}));process.exitCode=3}
}
