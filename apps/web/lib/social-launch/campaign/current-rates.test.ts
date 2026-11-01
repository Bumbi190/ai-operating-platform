import {expect,it,vi} from 'vitest'
import {getCurrentImageRates} from '@/lib/cost/current-image-rates'
function db(data:unknown,error:unknown=null){const query={select:vi.fn(()=>query),in:vi.fn(()=>query),abortSignal:vi.fn(async()=>({data,error}))};return {from:vi.fn(()=>query)} as never}
it('requires both current positive canonical prices without a fallback',async()=>{
 for(const rows of [[],[{key:'usd_sek',value:10.5}],[{key:'usd_sek',value:-1},{key:'ideogram_v3_usd_per_image',value:0.08}],[{key:'usd_sek',value:10.5},{key:'ideogram_v3_usd_per_image',value:'bad'}]]){
 await expect(getCurrentImageRates(db(rows))).rejects.toThrow()
 }
 await expect(getCurrentImageRates(db(null,{message:'unreadable'}))).rejects.toThrow()
})
it('new server reads see a changed live rate immediately instead of the shared five-minute cache',async()=>{
 expect(await getCurrentImageRates(db([{key:'usd_sek',value:'10.5'},{key:'ideogram_v3_usd_per_image',value:'0.08'}]))).toEqual({usd_sek:10.5,ideogram_v3_usd_per_image:0.08})
 expect(await getCurrentImageRates(db([{key:'usd_sek',value:'15'},{key:'ideogram_v3_usd_per_image',value:'0.8'}]))).toEqual({usd_sek:15,ideogram_v3_usd_per_image:0.8})
})
