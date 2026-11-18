import {salesEnabled} from '../feature'
export function initialSendEnabled(projectId:string):boolean{return process.env.ATLAS_SALES_INITIAL_SEND_ENABLED==='true'&&salesEnabled(projectId)}
