// UI-only boundaries. No auth session, database, provider or build is executed.
import {useSyncExternalStore} from 'react'
const subscribe=(cb:()=>void)=>{window.addEventListener('popstate',cb);return()=>window.removeEventListener('popstate',cb)}
export function usePathname(){return useSyncExternalStore(subscribe,()=>location.pathname,()=>'/build')}
export function useRouter(){return {refresh(){},push:(url:string)=>location.assign(url),replace:(url:string)=>location.replace(url)}}
export function useOptionalAtlas(){return {captureError:null,captureUtterance:()=>()=>{},stopAudio(){}}}
export function createClient(){throw Error('The UI fixture must not authenticate')}
export function AtlasBuildSurface(){throw Error('The UI fixture must not execute a build')}
