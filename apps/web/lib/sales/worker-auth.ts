import {createHash} from 'node:crypto'
import {SalesError} from './types'
export function workerTokenHash(request:Request):string{
 const h=request.headers.get('authorization')??''
 if(!/^Bearer [A-Za-z0-9_-]{43}$/.test(h))throw new SalesError('UNAUTHORIZED',401)
 return createHash('sha256').update(h.slice(7)).digest('hex')
}
