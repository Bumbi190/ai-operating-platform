/**
 * Local operator tool; no render/generation/social dispatch.
 * From apps/web: node ../../node_modules/tsx/dist/cli.mjs --tsconfig scripts/tsconfig.operator.json scripts/the-prompt-admit-review-video.ts
 * --project UUID --script UUID --video PATH --manifest PATH --operator-jwt-file PATH [--apply]
 * Environment must already provide Supabase configuration. Never print session tokens or proof documents.
 */
import {readFile} from 'node:fs/promises'
import {createAdminClient} from '../lib/supabase/admin'
import {admitReviewVideo,authenticateReviewOperator} from '../lib/social-launch/news-review/admission'
import {NewsReviewError} from '../lib/social-launch/news-review/types'
async function main(){
 const args=process.argv.slice(2),values=new Map<string,string>(),allowed=['--project','--script','--video','--manifest','--operator-jwt-file']
 if(args.includes('--help')){console.log('Required: --project UUID --script UUID --video PATH --manifest PATH --operator-jwt-file PATH; dry-run by default, --apply admits a private canonical asset.');return}
 let apply=false
 for(let i=0;i<args.length;i++){if(args[i]==='--apply'){if(apply)throw new NewsReviewError('INVALID_BODY');apply=true;continue}if(!allowed.includes(args[i])||values.has(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw new NewsReviewError('INVALID_BODY');values.set(args[i],args[++i])}
 if(allowed.some(k=>!values.has(k)))throw new NewsReviewError('INVALID_BODY')
 const token=(await readFile(values.get('--operator-jwt-file')!,'utf8')).trim()
 if(token.length>16384)throw new NewsReviewError('INVALID_BODY')
 const principal=await authenticateReviewOperator(createAdminClient(),token)
 console.log(JSON.stringify(await admitReviewVideo(principal,{projectId:values.get('--project')!,scriptId:values.get('--script')!,videoPath:values.get('--video')!,manifestPath:values.get('--manifest')!,apply})))
}
main().catch(e=>{console.error(e instanceof NewsReviewError?e.code:'REVIEW_ADMISSION_UNAVAILABLE');process.exitCode=1})
