import { expect, test } from '@playwright/test'
import JSZip from 'jszip'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
test('independent tab groups preserve unrelated visible content', async ({ page, request }) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Bygg med Atlas' })).toBeVisible()
  const id = new URL(page.url()).searchParams.get('session')!
  await request.get(`/__fixture/step/${id}/tabs`); await expect(page.getByTitle('Webbpreview version 1')).toBeVisible()
  const frame = page.frameLocator('iframe')
  await frame.getByRole('button', { name: 'A2', exact: true }).click(); await expect(frame.getByText('Andra A', { exact: true })).toBeVisible(); await expect(frame.getByText('Första B', { exact: true })).toBeVisible()
  await frame.getByRole('button', { name: 'B2', exact: true }).click(); await expect(frame.getByText('Andra B', { exact: true })).toBeVisible(); await expect(frame.getByText('Andra A', { exact: true })).toBeVisible()
})
test('form limitation stays readable outside model styles', async ({ page, request }) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Bygg med Atlas' })).toBeVisible()
  const id = new URL(page.url()).searchParams.get('session')!
  await request.get(`/__fixture/step/${id}/forms`); await expect(page.getByTitle('Webbpreview version 1')).toBeVisible()
  await expect(page.getByText('Formuläret behöver en ansluten mottagare innan meddelanden kan skickas.', { exact: true })).toBeVisible()
})
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
test('voice transcript requires explicit send, then v3 and real pause resume cancel receipts', async ({ page, request }) => {
  await page.addInitScript(() => {
    class Recognition {
      onresult: ((event: unknown) => void) | null = null; onerror: ((event: unknown) => void) | null = null; onend: (() => void) | null = null
      start() { (window as unknown as { fixtureRecognition: Recognition }).fixtureRecognition = this }
      stop() {} abort() {}
    }
    Object.assign(window, { SpeechRecognition: Recognition })
  })
  const posts: Record<string, unknown>[] = [], controls: string[] = []
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/feedback')) posts.push(request.postDataJSON()); if (request.url().endsWith('/control')) controls.push(request.url()) })
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Bygg med Atlas' })).toBeVisible()
  const id = new URL(page.url()).searchParams.get('session')!
  await request.get(`/__fixture/step/${id}/commit`); await expect(page.getByTitle('Webbpreview version 1')).toBeVisible()
  await page.getByLabel('Feedback till Atlas').fill('Version två'); await page.getByRole('button', { name: 'Skicka', exact: true }).click()
  await request.get(`/__fixture/step/${id}/commit`); await expect(page.getByTitle('Webbpreview version 2')).toBeVisible()
  const state = await (await request.get(`/api/website-builds/${id}?projectId=10000000-0000-4000-8000-000000000001`)).json()
  await page.getByRole('button', { name: 'Prata med Atlas' }).click()
  await page.evaluate(() => { (window as unknown as { fixtureRecognition: { onresult: (e: unknown) => void } }).fixtureRecognition.onresult({ results: [{ 0: { transcript: 'Röst med fel ord' }, isFinal: true }] }) })
  await expect(page.getByLabel('Redigera rösttranskript')).toHaveValue('Röst med fel ord')
  expect(posts).toHaveLength(1)
  await page.getByLabel('Redigera rösttranskript').fill('Rättad rösttext till version tre'); await page.getByRole('button', { name: 'Skicka', exact: true }).click()
  await expect.poll(() => posts.length).toBe(2); expect(posts[1]).toMatchObject({ inputSource: 'voice', viewedRevisionId: state.activePreviewRevisionId, text: 'Rättad rösttext till version tre' })
  await request.get(`/__fixture/step/${id}/commit`); await expect(page.getByTitle('Webbpreview version 3')).toBeVisible()
  await page.getByRole('button', { name: 'Stoppa uppläsning' }).click(); expect(controls).toHaveLength(0)
  await page.getByRole('button', { name: 'Pausa bygget' }).click(); await expect(page.getByText('Pausad', { exact: true })).toBeVisible()
  await page.getByLabel('Feedback till Atlas').fill('Sparad ändring i paus'); await page.getByRole('button', { name: 'Skicka', exact: true }).click()
  await page.getByRole('button', { name: 'Fortsätt bygget' }).click(); await expect(page.getByText('I kö', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Pausa bygget' }).click(); await expect(page.getByText('Pausar', { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Fortsätt bygget' })).toHaveCount(0)
  await request.get(`/__fixture/step/${id}/pause`); await expect(page.getByText('Pausad', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Fortsätt bygget' }).click(); await request.get(`/__fixture/step/${id}/commit`); await expect(page.getByTitle('Webbpreview version 4')).toBeVisible()
  await page.getByRole('button', { name: 'Avbryt bygget' }).click(); await expect(page.getByText('Avbruten', { exact: true })).toBeVisible()
  await page.reload(); await expect(page.getByTitle('Webbpreview version 4')).toBeVisible(); await expect(page.getByText('Införd · version 4', { exact: true })).toBeVisible()
})
test('unsupported and denied mic keep text available and route cleanup drops late voice', async ({ page }) => {
  await page.addInitScript(() => { Object.assign(window, { SpeechRecognition: undefined, webkitSpeechRecognition: undefined }) })
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Bygg med Atlas' })).toBeVisible()
  await page.getByRole('button', { name: 'Prata med Atlas' }).click(); await expect(page.getByText(/Röstinmatning stöds inte/)).toBeVisible()
  await page.getByLabel('Feedback till Atlas').fill('Text fungerar'); await expect(page.getByRole('button', { name: 'Skicka', exact: true })).toBeEnabled()
  await page.evaluate(() => {
    class Recognition {
      onresult: ((event: unknown) => void) | null = null; onerror: ((event: unknown) => void) | null = null; onend: (() => void) | null = null
      start() { this.onerror?.({ error: 'not-allowed' }) } stop() {} abort() {}
    }
    Object.assign(window, { SpeechRecognition: Recognition })
  })
  await page.getByRole('button', { name: 'Prata med Atlas' }).click(); await expect(page.getByText(/Mikrofonåtkomst nekad/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Skicka', exact: true })).toBeEnabled()
  await page.evaluate(() => {
    class Recognition {
      onresult: ((event: unknown) => void) | null = null; onerror: ((event: unknown) => void) | null = null; onend: (() => void) | null = null
      start() { Object.assign(window, { fixtureLateResult: this.onresult }) } stop() {} abort() {}
    }
    Object.assign(window, { SpeechRecognition: Recognition })
  })
  await page.getByRole('button', { name: 'Prata med Atlas' }).click()
  await page.evaluate(async () => { await (window as unknown as { fixtureSwitchSession: () => Promise<void> }).fixtureSwitchSession() })
  await expect(page.getByLabel('Feedback till Atlas')).toHaveValue('')
  await page.evaluate(() => { (window as unknown as { fixtureLateResult: (event: unknown) => void }).fixtureLateResult({ results: [{ 0: { transcript: 'Till en gammal session' }, isFinal: true }] }) })
  await expect(page.getByLabel('Feedback till Atlas')).toHaveValue('')
})
