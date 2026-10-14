import { expect, test } from '@playwright/test'
import JSZip from 'jszip'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
test('brief to preview, concurrent feedback, history and reload', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Bygg med Atlas' })).toBeVisible()
  const id = new URL(page.url()).searchParams.get('session')!
  await request.get(`/__fixture/step/${id}/commit`)
  await expect(page.getByTitle('Webbpreview version 1')).toBeVisible()
  await page.getByLabel('Feedback till Atlas').fill('Gör rubriken större och lägg till vår svenska öppettid')
  await page.getByRole('button', { name: 'Skicka', exact: true }).click()
  await expect(page.getByText('Mottagen', { exact: true })).toBeVisible()
  await request.get(`/__fixture/step/${id}/ack`)
  await expect(page.getByText('Förstådd', { exact: true })).toBeVisible()
  await page.getByLabel('Feedback till Atlas').fill('Nästa ändring medan du bygger')
  await expect(page.getByRole('button', { name: 'Skicka', exact: true })).toBeEnabled()
  await expect(page.getByTitle('Webbpreview version 1')).toBeVisible()
  await request.get(`/__fixture/step/${id}/commit`)
  await expect(page.getByTitle('Webbpreview version 2')).toBeVisible()
  await expect(page.getByText('Införd · version 2', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Feedback till Atlas')).toHaveValue('Nästa ändring medan du bygger')
  await expect(page.getByTitle('Webbpreview version 2')).toBeVisible()
  await page.getByLabel('Version', { exact: true }).selectOption({ label: 'Version 1' })
  await expect(page.getByTitle('Webbpreview version 1')).toBeVisible()
  await page.frameLocator('iframe').getByRole('button', { name: 'Meny' }).click()
  await page.frameLocator('iframe').getByRole('link', { name: 'Kontakt' }).click()
  await expect(page.getByLabel('Sida', { exact: true })).toHaveValue('contact')
  await page.screenshot({ path: '../../.superpowers/sdd/2026-10-14-atlas-live-build-workspace/workspace-desktop.png', fullPage: true })
})
test('opaque preview blocks parent access, network, popups and forged navigation', async ({ page, request }) => {
  const unexpected: string[] = []
  // Request events include attempts already blocked by CSP; routing observes
  // requests that actually reach the browser's network layer.
  await page.route('**/example.invalid/**', route => { unexpected.push(route.request().url()); return route.abort() })
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Bygg med Atlas' })).toBeVisible()
  const id = new URL(page.url()).searchParams.get('session')!
  await request.get(`/__fixture/step/${id}/commit`); await expect(page.getByTitle('Webbpreview version 1')).toBeVisible()
  const frame = page.frames().find(frame => frame.parentFrame())!
  const result = await frame.evaluate(async () => {
    let parentBlocked = false, cookiesBlocked = false, fetchBlocked = false
    try { parent.document.body.dataset.compromised = 'yes' } catch { parentBlocked = true }
    try { void document.cookie } catch { cookiesBlocked = true }
    try { await fetch('https://example.invalid/private') } catch { fetchBlocked = true }
    const image = document.createElement('img'); image.src = 'https://example.invalid/pixel'; document.body.append(image)
    const popupBlocked = window.open('https://example.invalid/popup') === null
    let topBlocked = false; try { top!.location.href = 'https://example.invalid/top' } catch { topBlocked = true }
    return { parentBlocked, cookiesBlocked, fetchBlocked, popupBlocked, topBlocked }
  })
  expect(result).toEqual({ parentBlocked: true, cookiesBlocked: true, fetchBlocked: true, popupBlocked: true, topBlocked: true })
  await page.evaluate(() => { const parsed = new DOMParser().parseFromString(document.querySelector('iframe')!.srcdoc, 'text/html'); const config = JSON.parse(parsed.getElementById('__atlas_config')!.textContent!); window.postMessage({ type: 'atlas-preview-page', token: config.preview.token, artifactHash: config.preview.artifactHash, pageKey: 'contact' }, '*') })
  await expect(page.getByLabel('Sida', { exact: true })).toHaveValue('index')
  expect(await page.evaluate(() => document.body.dataset.compromised)).toBeUndefined()
  expect(unexpected).toEqual([])
})
test('downloaded export runs menu and page navigation from disk', async ({ page, request, context }) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Bygg med Atlas' })).toBeVisible()
  const id = new URL(page.url()).searchParams.get('session')!
  await request.get(`/__fixture/step/${id}/commit`); await expect(page.getByTitle('Webbpreview version 1')).toBeVisible()
  const href = await page.getByRole('link', { name: 'Ladda ner ZIP' }).getAttribute('href')
  const response = await request.get(href!); expect(response.ok()).toBe(true)
  const zip = await JSZip.loadAsync(await response.body()), folder = resolve('../../.superpowers/sdd/2026-10-14-atlas-live-build-workspace/export-browser', id)
  await mkdir(folder, { recursive: true })
  for (const file of Object.values(zip.files)) if (!file.dir) await writeFile(resolve(folder, file.name), await file.async('nodebuffer'))
  const exported = await context.newPage(); await exported.goto(pathToFileURL(resolve(folder, 'index.html')).href)
  await exported.getByRole('button', { name: 'Meny' }).click(); await expect(exported.getByRole('link', { name: 'Kontakt' })).toBeVisible()
  await exported.getByRole('link', { name: 'Kontakt' }).click(); await expect(exported.getByRole('heading', { name: 'Kontakta caféet' })).toBeVisible()
})
test('broken candidate keeps previous preview', async ({ page, request }) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Bygg med Atlas' })).toBeVisible()
  const id = new URL(page.url()).searchParams.get('session')!
  await request.get(`/__fixture/step/${id}/commit`); await expect(page.getByTitle('Webbpreview version 1')).toBeVisible()
  await page.getByLabel('Feedback till Atlas').fill('Ny ändring'); await page.getByRole('button', { name: 'Skicka', exact: true }).click()
  await request.get(`/__fixture/step/${id}/fail`)
  await expect(page.getByText('Bygget misslyckades', { exact: true })).toBeVisible(); await expect(page.getByTitle('Webbpreview version 1')).toBeVisible()
})
test('splitter and mobile tabs keep composer usable', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Bygg med Atlas' })).toBeVisible()
  await page.setViewportSize({ width: 1440, height: 1000 })
  const separator = page.getByRole('separator'); await separator.focus(); await page.keyboard.press('ArrowRight'); await expect(separator).toHaveAttribute('aria-valuenow', '40')
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 }); await page.getByRole('tab', { name: 'Atlas', exact: true }).click()
    await page.getByLabel('Feedback till Atlas').fill('En längre svensk mening med önskemål om öppettider och kontaktuppgifter')
    await expect(page.getByRole('button', { name: 'Skicka', exact: true })).toBeVisible()
    await page.getByRole('tab', { name: 'Preview', exact: true }).click(); await expect(page.getByText('Din idé blir en hemsida här.')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%' }); await page.getByRole('tab', { name: 'Atlas', exact: true }).click(); await expect(page.getByLabel('Feedback till Atlas')).toBeVisible()
  const tabBounds = await page.getByRole('tab', { name: 'Preview', exact: true }).boundingBox()
  expect(tabBounds!.x + tabBounds!.width).toBeLessThanOrEqual(308)
  await page.screenshot({ path: '../../.superpowers/sdd/2026-10-14-atlas-live-build-workspace/workspace-mobile.png', fullPage: true })
})
