import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {expect,it} from 'vitest'
import {StudioTotalAllowance} from '@/components/website-build/StudioCostControl'
it('labels the one-off ceiling allowance independently of invoiced SEK spend',()=>{
 const html=renderToStaticMarkup(createElement(StudioTotalAllowance,{total:{currency:'USD',limitMicros:10000000,committedMicros:3500000,remainingMicros:6500000}}))
 expect(html).toContain('6,50 USD kvar av 10,00')
 expect(html).toContain('3,50 USD')
 expect(html).toContain('hård spärr')
 expect(html).toContain('inte fakturerad kostnad')
 expect(html).toContain('Förnyas inte automatiskt')
})
it('does not round a remaining microdollar up to a cent',()=>{
 const html=renderToStaticMarkup(createElement(StudioTotalAllowance,{total:{currency:'USD',limitMicros:10000000,committedMicros:9999999,remainingMicros:1}}))
 expect(html).toContain('0,000001 USD kvar')
})
