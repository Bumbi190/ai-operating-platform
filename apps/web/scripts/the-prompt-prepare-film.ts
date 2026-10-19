/**
 * From apps/web: node ../../node_modules/tsx/dist/cli.mjs --tsconfig scripts/tsconfig.operator.json scripts/the-prompt-prepare-film.ts --help
 * Uses existing Supabase environment configuration; never prints credentials.
 * The only output is a read-only proposal on stdout. There is no --apply mode.
 */
import {open} from 'node:fs/promises'
const options=['--project','--post','--revision','--sha256','--brief','--operator-jwt-file']
const HELP='Read-only film preparation. Required: --project UUID --post UUID --revision UUID --sha256 SHA256 --brief PATH --operator-jwt-file PATH. No generation, database writes or --apply.'
async function limitedFile(path:string,limit:number){
 const handle=await open(path,'r')
 try{
  const stat=await handle.stat()
  if(!stat.isFile()||stat.size<1||stat.size>limit)throw Error('INVALID_BODY')
  const buffer=Buffer.alloc(limit+1);let length=0
  while(length<buffer.length){const part=await handle.read(buffer,length,buffer.length-length,null);if(!part.bytesRead)break;length+=part.bytesRead}
  if(length<1||length>limit)throw Error('INVALID_BODY')
  return new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,length))
 }finally{await handle.close()}
}
async function main(){
 const args=process.argv.slice(2)
 if(args.length===1&&args[0]==='--help'){console.log(HELP);return}
 const values=new Map<string,string>()
 for(let i=0;i<args.length;i++){
  const key=args[i],value=args[++i]
  if(!options.includes(key)||values.has(key)||!value||value.startsWith('--'))throw Error('INVALID_BODY')
  values.set(key,value)
 }
 if(values.size!==options.length)throw Error('INVALID_BODY')
 const brief=JSON.parse(await limitedFile(values.get('--brief')!,64*1024))
 const token=(await limitedFile(values.get('--operator-jwt-file')!,16*1024)).trim()
 if(!token)throw Error('INVALID_BODY')
 // Import server wiring only after local argument/file checks; --help needs no environment.
 const [{createAdminClient},{authenticateReviewOperator},{prepareFilm}]=await Promise.all([
  import('../lib/supabase/admin'),import('../lib/social-launch/news-review/admission'),import('../lib/social-launch/news-review/film-preparation')])
 const db=createAdminClient(),principal=await authenticateReviewOperator(db,token)
 const result=await prepareFilm(db,principal,{projectId:values.get('--project'),postId:values.get('--post'),revisionId:values.get('--revision'),sha256:values.get('--sha256')},brief)
 console.log(JSON.stringify(result))
}
main().catch(error=>{
 const code=error?.code
 const allowed=['INVALID_BODY','NOT_FOUND','STOPPED','UNAVAILABLE','REVISION_CONFLICT','PLAN_REQUIRED','PLAN_CHANGED','UNSUPPORTED_DRAFT','BRIEF_MISMATCH','SOURCE_EXPIRED','SOURCE_NOT_ELIGIBLE']
 console.error(allowed.includes(code)?code:error?.message==='INVALID_BODY'?'INVALID_BODY':'PREPARATION_UNAVAILABLE')
 process.exitCode=1
})
