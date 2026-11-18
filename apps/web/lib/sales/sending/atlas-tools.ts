import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import type {SalesPrincipal} from '../types'
import type {SalesDb} from '../store'
import {readReplySend} from './store'
export const SEND_TOOLS:Anthropic.Tool[]=[{name:'get_sales_send_status',description:'Read persisted status of one owner-confirmed send job. smtp_accepted means Strato accepted it; deliveryConfirmed remains false until separately verified. Cannot authorize, send, retry, change recipient or policy.',input_schema:{type:'object',additionalProperties:false,properties:{projectId:{type:'string'},sendJobId:{type:'string'}},required:['projectId','sendJobId']}}]
export async function readSendStatus(input:unknown,principal:SalesPrincipal,db:SalesDb){return readReplySend(db,principal,input)}
