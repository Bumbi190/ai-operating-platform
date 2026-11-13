import {inspectApprovedClipDirectory,ApprovedClipRefusal} from './approved-clips-preflight.mjs'

function arg(name){
  const i=process.argv.indexOf(name)
  if(i<0)return null
  return process.argv[i+1]??null
}
async function main(){
  if(process.argv.includes('--help')){
    console.log('Usage: node approved-clips-check.mjs --source-dir <folder>')
    console.log('Read-only: validates the 4 locked The Prompt source MP4 files.')
    return
  }
  const dir=arg('--source-dir')
  if(!dir)throw new ApprovedClipRefusal('source_dir_required')
  const clips=await inspectApprovedClipDirectory(dir)
  for(const c of clips){
    console.log([c.name,'OK',c.width+'x'+c.height,c.durationMs+'ms',
      c.size+' bytes',c.sha256.slice(0,16)+'…'].join(' | '))
  }
  console.log('PASS: 4/4 approved files. DRY-RUN ONLY: no storage, database, cost or publish calls.')
}
main().catch(e=>{
  const code=e instanceof ApprovedClipRefusal?e.code:'unexpected_error'
  console.error('NO-GO: '+code)
  process.exitCode=1
})
