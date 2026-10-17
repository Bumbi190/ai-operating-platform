import {test,expect} from '@playwright/test'
const C='50000000-0000-4000-8000-000000000001',P='8f673c09-1c8f-4d78-876e-4c14bf1c89b3',B='44000000-0000-4000-8000-000000000001',ID='22000000-0000-4000-8000-000000000001',R='33000000-0000-4000-8000-000000000001'
const view={packageView:{packageId:ID,projectId:P,conversationId:C,operatorBindingId:B,operation:'quarantine',organisationIds:['66000000-0000-4000-8000-000000000001'],classificationRevision:'a'.repeat(64),graphSha256:'b'.repeat(64),expiresAt:'2099-01-01T00:00:00Z',counts:{organizations:1},blockers:[],status:'prepared'},reviewRef:R,decisionState:'pending',executionId:null,receipt:null}
test('a phone review stays in its thread across navigation and requires a receipt',async({page})=>{
 const posts:any[]=[]
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue()
 if(u.pathname==='/api/conversations')return route.fulfill({json:{id:C}})
 if(u.pathname==='/api/chat')return route.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify({event:'handlarborsen_test_data_review',conversationId:C,review:view})+'\n\ndata: {"event":"done"}\n\n'})
 if(u.pathname.endsWith('/review')){if(route.request().method()==='POST'){posts.push(route.request().postDataJSON());return route.fulfill({json:{...view,decisionState:'approved',executionId:R}})}return route.fulfill({json:view})}
 return route.fulfill({json:{}})
 })
 await page.goto('/chat/'+C);await page.getByLabel('Meddelande till Atlas').fill('Förbered teststädning');await page.getByRole('button',{name:'Skicka',exact:true}).click()
 const card=page.getByRole('region',{name:'Granska testdata'});await expect(card).toBeVisible();await expect(card).toContainText('1 organisation')
 await page.getByRole('button',{name:'Godkänn och lägg undan testdata'}).click();await expect(card).toContainText('Utfallet kontrolleras');await expect(card).not.toContainText('Testdata undanlagd')
 expect(posts).toEqual([{conversationId:C,reviewRef:R,decision:'approve'}])
 await page.getByRole('button',{name:'/projects/test-project',exact:true}).click();await page.getByRole('button',{name:'/chat/'+C,exact:true}).click();await expect(card).toBeVisible()
 await page.getByRole('button',{name:'Fixture switch thread'}).click();await expect(card).toHaveCount(0)
 await page.getByRole('button',{name:'Fixture signout'}).click();await expect(card).toHaveCount(0)
})

test('global voice panel and full chat share a review across minimize and navigation',async({page})=>{
 const calls:string[]=[]
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();calls.push(u.pathname)
 if(u.pathname==='/api/conversations')return route.fulfill({json:{id:C}})
 if(u.pathname==='/api/chat')return route.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify({event:'handlarborsen_test_data_review',conversationId:C,review:view})+'\n\ndata: {"event":"done"}\n\n'})
 if(u.pathname.endsWith('/review'))return route.fulfill({json:view})
 return route.fulfill({json:{}})
 })
 await page.goto('/dashboard?voice-live=1');await page.getByRole('button',{name:'Öppna Atlas',exact:true}).click();await page.getByRole('dialog',{name:'Atlas chatt'}).getByRole('button',{name:'Starta samtal',exact:true}).click()
 const panel=page.getByRole('region',{name:'Atlas röstsamtal'});await expect(panel).toBeVisible()
 await panel.getByLabel('Prata eller skriv till Atlas').fill('Förbered testdata');await panel.getByRole('button',{name:'Skicka till Atlas'}).click()
 await expect(panel.getByRole('region',{name:'Granska testdata'})).toBeVisible()
 await page.getByRole('button',{name:'Minimera röstsamtalet'}).click()
 await page.getByRole('button',{name:'/projects/test-project',exact:true}).click()
 await page.getByRole('button',{name:'Visa röstsamtalet'}).click()
 await expect(panel.getByRole('region',{name:'Granska testdata'})).toBeVisible()
 expect(calls.filter(v=>v==='/api/tts')).toHaveLength(0)
 await page.getByRole('button',{name:'Avsluta röstsamtalet'}).click()
 await page.getByRole('button',{name:'/chat/'+C,exact:true}).click()
 await expect(page.getByRole('region',{name:'Granska testdata'})).toBeVisible()
})
