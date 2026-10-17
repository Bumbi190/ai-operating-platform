import {createHash} from 'node:crypto'
import type {SalesDraft} from './types'
import {parseSalesDraft} from './validate'
export function hashSalesDraft(value:SalesDraft):string{
  const d=parseSalesDraft(value)
  return createHash('sha256').update(JSON.stringify([d.contactId,d.contactVersion,d.offerRevisionId,d.senderEmail,d.toEmail,d.subject,d.body,[...d.evidenceIds].sort(),d.questions])).digest('hex')
}
