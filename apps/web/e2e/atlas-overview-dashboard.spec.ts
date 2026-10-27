import { test, expect } from '@playwright/test'
for (const width of [390, 1280, 1920]) {
  test('overview layout ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/dashboard')
    await expect(
      page.getByRole('heading', { name: 'Översikt', exact: true })
    ).toBeVisible()
    await expect(page.locator('[data-overview-chart]')).toHaveCount(2)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(width)
    await page.screenshot({
      path:
        '../../.superpowers/sdd/2026-10-15-atlas-overview-messenger-plan/overview-' +
        width +
        '.png',
      fullPage: true
    })
  })
}
test('7 and 30 day controls and honest source states', async ({ page }) => {
  await page.goto('/dashboard?period=30')
  await expect(
    page.getByRole('link', { name: '30 dagar', exact: true })
  ).toHaveAttribute('aria-current', 'page')
  await page.goto('/dashboard?fixture-state=partial')
  await expect(page.getByText('Ofullständiga data').first()).toBeVisible()
  await expect(page.locator('[data-overview-chart]')).toHaveCount(0)
  await page.goto('/dashboard?fixture-state=unavailable')
  await expect(page.getByText('Data kunde inte läsas').first()).toBeVisible()
  await page.goto('/dashboard?fixture-empty=1')
  await expect(
    page.getByText('Inga projekt', { exact: false }).first()
  ).toBeVisible()
})

test('period links preserve an open chat draft', async ({ page }) => {
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'Öppna Atlas' }).click()
  await page.getByRole('textbox').fill('Spara mitt utkast')
  // The compact, draggable window can cover the period links on this
  // deliberately short fixture. Move it aside just as an operator would.
  const panel=await page.getByRole('dialog',{name:'Atlas chatt'}).boundingBox()
  if(!panel)throw Error('Compact chat missing')
  await page.mouse.move(panel.x+90,panel.y+22)
  await page.mouse.down()
  await page.mouse.move(panel.x-410,panel.y+22,{steps:12})
  await page.mouse.up()

  await page.getByRole('link', { name: '30 dagar', exact: true }).click()
  await expect(
    page.getByRole('link', { name: '30 dagar', exact: true })
  ).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('textbox')).toHaveValue('Spara mitt utkast')
})
