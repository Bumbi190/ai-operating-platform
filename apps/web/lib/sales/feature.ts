import {UUID} from './validate'
export function salesEnabled(projectId?:string):boolean{return process.env.ATLAS_SALES_ENABLED==='true'&&UUID.test(process.env.ATLAS_SALES_PROJECT_ID??'')&&(!projectId||process.env.ATLAS_SALES_PROJECT_ID===projectId)}
