/**
 * Read an already VERIFIED, secret-free quote result and write a new immutable
 * intake plan in a user-selected output directory.
 *
 * This script NEVER requests data, never reads Databento API key, and never
 * enables the paid timeseries route. Output file is created exclusively.
 *
 * Usage:
 *   node databento-first-day-plan-cli.mjs quote.json output-directory
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {prepareFirstRealNqEsIntake} from './databento-first-day-gate.mjs'

export async function generateIntakePlan({quotePath,outDir}){
 if(typeof quotePath!=='string'||!quotePath||
    typeof outDir!=='string'||!outDir)throw Error('QUOTE_PATH_AND_OUTPUT_DIRECTORY_REQUIRED')
 // Only read local, bounded, *public* metadata summary, not key/.env.
 if(!/Quote_Result_Public\.json$/i.test(quotePath))throw Error('PUBLIC_METADATA_QUOTE_REQUIRED')
 const input=await readFile(quotePath)
 if(input.length>20000)throw Error('QUOTED_METADATA_TOO_LARGE')
 const raw=input.toString('utf8').replace(/^\uFEFF/,'')
 let quote
 try{quote=JSON.parse(raw)}catch{throw Error('INVALID_QUOTE_JSON')}
 const plan=prepareFirstRealNqEsIntake(quote)
 if(plan.status!=='PLAN_READY_AWAITING_SEPARATE_APPROVAL')
  throw Error('IMPORT_PLAN_BLOCKED_'+plan.reason)
 const digest=createHash('sha256').update(input).digest('hex')
 const safePlan=Object.freeze({
  ...plan,
  quotePublicFileSha256:digest,
  quoteIsFreeMetadata:true,
  userApprovedPaidRequest:false,
  newDownloadRequestsMade:0
 })
 const target=resolve(outDir)
 // Refuse writing into a repo checkout by convention. Keep real snapshots,
 // quotes and review plans in the model-runner's local Previews directory.
 // Check exact path *segments*; a TEMP parent or strings containing
 // "previews" must not accidentally authorize a repo checkout.
 const segments=target.toLowerCase().split(/[\\/]/).filter(Boolean)
 if(!segments.includes('previews')||segments.includes('ai-operating-platform')||
  segments.includes('.git')||segments.includes('src'))
  throw Error('OUTPUT_MUST_BE_A_NONREPO_PREVIEW_OR_TEMP_DIRECTORY')
 await mkdir(target,{recursive:true})
 const name='First_NQ_ES_Historical_Import_Plan.json'
 const path=join(target,name)
 await writeFile(path,JSON.stringify(safePlan,null,2)+'\n',{flag:'wx',encoding:'utf8'})
 return Object.freeze({status:safePlan.status,
  file:path,contractCount:safePlan.instruments.length,
  combinedEstimateUSD:safePlan.vendorEstimatedCombinedUSD,
  proposedLimitUSD:safePlan.proposedHardLimitUSD,
  downloadedRecords:0,userApprovedPaidRequest:false,
  quotePublicFileSha256:digest})
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
  const r=await generateIntakePlan({quotePath:process.argv[2],outDir:process.argv[3]})
  console.log(JSON.stringify(r,null,2))
 }catch(e){
  console.error('BLOCKED_'+String(e.message).replace(/[^A-Za-z0-9_]/g,'_'))
  process.exitCode=2
 }
}
