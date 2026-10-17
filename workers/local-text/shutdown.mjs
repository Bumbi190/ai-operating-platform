import {access} from 'node:fs/promises';
/** Only the fixed operator config directory supplies this marker path. */
export function observeStopFile(file,controller,intervalMs=250){let active=true,pending=false;const timer=setInterval(async()=>{if(!active||pending||controller.signal.aborted)return;pending=true;try{await access(file);if(active)controller.abort();}catch(e){if(e.code!=='ENOENT'&&active)controller.abort();}finally{pending=false;}},intervalMs);timer.unref();return ()=>{active=false;clearInterval(timer);};}
