import { test, expect } from '@playwright/test'

test('sample schedules native PCM output without a microphone', async ({ page }) => {
  await page.goto('/atlas/rosttest')
  await page.getByRole('button', { name: 'Provlyssna', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Atlas pratar' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Talbegäranden: 1' })).toBeVisible()
})

test('native worklet input reaches transcription, chat and scheduled PCM output', async ({ page }) => {
  await page.goto('/atlas/rosttest')
  await page.getByRole('button', { name: 'Håll chattsvar: på' }).click()
  await page.getByRole('button', { name: 'Starta mikrofonen' }).click()
  await expect(page.getByRole('status').filter({ hasText: /^Atlas lyssnar$/ })).toBeVisible()
  await page.getByRole('button', { name: 'Säg första frågan' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Transkriberingar: 1' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Chattbegäranden: 1' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Atlas pratar' })).toBeVisible()
})

test('speaker input cannot cancel output while a reply is being prepared', async ({ page }) => {
  await page.goto('/atlas/rosttest')
  await page.getByRole('button', { name: 'Fördröj chattskapande: av' }).click()
  await page.getByRole('button', { name: 'Starta mikrofonen' }).click()
  await expect(page.getByRole('status').filter({ hasText: /^Atlas lyssnar$/ })).toBeVisible()
  await page.getByLabel('Det du vill säga').fill('En fråga som får vänta på sitt svar.')
  await page.getByRole('button', { name: 'Skicka', exact: true }).click()
  await page.getByRole('button', { name: 'Säg första avbrottet' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Transkriberingar: 1' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Jag hörde dig')
  await page.getByRole('button', { name: 'Släpp chattskapande' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Chattbegäranden: 1' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Atlas pratar' })).toBeVisible()
  await expect(page.getByLabel('Det du vill säga')).toHaveValue('Lägg till en blå knapp.')
})
