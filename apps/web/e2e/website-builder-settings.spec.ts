import {test,expect} from '@playwright/test'
test('operator chooses a default folder and an explicit builder for the named project',async({page})=>{
 await page.route('**/api/website-build-settings/default-root',async route=>{
  const b=route.request().postDataJSON();expect(b).toEqual({root:{os:'windows',root:'D:\\Atlas projects',targetId:null}})
  await route.fulfill({json:b.root})
 })
 await page.route('**/api/website-build-settings',async route=>{
  const b=route.request().postDataJSON();expect(b).toEqual({projectId:'10000000-0000-4000-8000-000000000001',agentId:'40000000-0000-4000-8000-000000000002'})
  await route.fulfill({json:{projectId:b.projectId,builderAgentId:b.agentId,domainRegistrar:'strato',location:null}})
 })
 await page.goto('/?settings=1')
 await page.getByLabel('Standardmapp för nya projekt').fill('D:\\Atlas projects')
 await page.getByRole('button',{name:'Spara standardmapp'}).click()
 await expect(page.getByText('Standardmappen är sparad.')).toBeVisible()
 await page.getByLabel('Webbbyggare för Testprojekt').selectOption('40000000-0000-4000-8000-000000000002')
 await page.getByRole('button',{name:'Spara för Testprojekt'}).click()
 await expect(page.getByText('Projektets inställningar är sparade.')).toBeVisible()
 await expect(page.getByText(/Lokal mapp skapas när/)).toBeVisible()
})
test('unreadable settings are reported and cannot overwrite an unknown assignment',async({page})=>{
 await page.goto('/?settings=1&unreadable=1')
 await expect(page.getByText('Projektets bygginställningar kunde inte läsas.')).toBeVisible()
 await expect(page.getByRole('button',{name:'Spara för Testprojekt'})).toBeDisabled()
})

test('a failed project inventory is shown as unreadable',async({page})=>{
 await page.goto('/?settings=1&unreadable-projects=1')
 await expect(page.getByText('Projektlistan kunde inte läsas.')).toBeVisible()
 await expect(page.getByRole('button',{name:'Spara för Testprojekt'})).toHaveCount(0)
})
