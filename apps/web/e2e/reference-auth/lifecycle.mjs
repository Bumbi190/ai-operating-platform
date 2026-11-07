// Test-only ownership/lifecycle helpers. No production process imports this file.
import {spawn} from 'node:child_process'
export function managedProcess(command,args,options,launch=spawn){
 const child=launch(command,args,options)
 const proc={child,failure:null,done:null}
 // done always resolves: a startup error cannot become an unhandled rejection
 // while the runner is still polling readiness.
 proc.done=new Promise(resolve=>{
  child.once('error',error=>{proc.failure=error;resolve({error,code:null,signal:null})})
  child.once('exit',(code,signal)=>resolve({code,signal,error:null}))
 })
 return proc
}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
export async function stopManagedProcess(proc,kill=process.kill){
 if(!proc?.child?.pid)return
 const group=-proc.child.pid
 function alive(){
  try{kill(group,0);return true}catch(error){if(error.code==='ESRCH')return false;throw error}
 }
 if(!alive())return
 try{kill(group,'SIGTERM')}catch(error){if(error.code==='ESRCH')return;throw error}
 const deadline=Date.now()+5000
 while(alive()&&Date.now()<deadline)await delay(30)
 if(!alive())return
 try{kill(group,'SIGKILL')}catch(error){if(error.code==='ESRCH')return;throw error}
 const hardDeadline=Date.now()+2000
 while(alive()&&Date.now()<hardDeadline)await delay(30)
 if(alive())throw Error('Owned fixture process group remains')
}
export async function attemptCleanup(actions){
 const errors=[]
 for(const action of actions){try{await action()}catch(error){errors.push(error)}}
 if(errors.length)throw new AggregateError(errors,'Fixture cleanup failed')
}
