import {createHash} from 'node:crypto'
import type {SalesDraft} from './types'
import {parseSalesDraft} from './validate'
export function hashSalesDraft(value:SalesDraft):string{
  const d=parseSalesDraft(value)
  // Match PostgreSQL jsonb array text, including separator spaces, for independent verification.
  const values=[d.contactId,d.contactVersion,d.offerRevisionId,d.senderEmail,d.toEmail,d.subject,d.body,[...d.evidenceIds].sort(),d.questions]
  const json=(v:unknown):string=>Array.isArray(v)?'['+v.map(json).join(', ')+']':JSON.stringify(v)
  return createHash('sha256').update(json(values)).digest('hex')
}
