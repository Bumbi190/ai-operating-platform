import { test, expect, type Page } from '@playwright/test'
const C = '50000000-0000-4000-8000-000000000001'
async function setup(page: Page, denied = false) {
  const requests: { url: string; body: any }[] = []
  let release = () => {}
  let hold = false
  await page.addInitScript(
    ({ denied }) => {
      ;(window as any).micStarts = 0
      ;(window as any).micStops = 0
      class Recognition {
        constructor() { (window as any).fixtureRecognition = this }
        onresult?: (e: any) => void
        onstart?: () => void
        onerror?: (e: any) => void
        onend?: () => void
        start() {
          ;(window as any).micStarts++
          setTimeout(
            () =>
              denied
                ? this.onerror?.({ error: 'not-allowed' })
                : this.onstart?.(),
            0
          )
        }
        abort() {
          ;(window as any).micStops++
        }
        stop() {
          ;(window as any).micStops++
        }
      }
      ;(window as any).SpeechRecognition = Recognition
    },
    { denied }
  )
  await page.route('**/*', async (route) => {
    const req = route.request(),
      url = new URL(req.url())
    if (url.hostname !== '127.0.0.1') return route.abort()
    if (!url.pathname.startsWith('/api/')) return route.continue()
    requests.push({ url: url.pathname, body: req.postDataJSON() })
    if (url.pathname === '/api/conversations')
      return route.fulfill({ json: { id: C } })
    if (url.pathname === '/api/chat') {
      if (hold) await new Promise<void>((r) => (release = r))
      return route.fulfill({
        contentType: 'text/event-stream',
        body:
          'data: ' +
          JSON.stringify({ event: 'text', text: 'hela det strömmade svaret' }) +
          '\n\ndata: {"event":"done"}\n\n'
      })
    }
    return route.fulfill({ json: {} })
  })
  await page.goto('/projects/test-project')
  return {
    requests,
    hold() {
      hold = true
    },
    release() {
      release()
    }
  }
}
test('opening is quiet, three controls and double send makes one turn', async ({
  page
}) => {
  const state = await setup(page)
  await page.getByRole('button', { name: 'Öppna Atlas' }).click()
  const panel = page.getByRole('dialog', { name: 'Atlas chatt' }),
    editor = panel.getByRole('textbox')
  await expect(editor).toBeFocused()
  await expect(panel.getByRole('button')).toHaveCount(3)
  expect(state.requests).toHaveLength(0)
  expect(await page.evaluate(() => (window as any).micStarts)).toBe(0)
  await editor.fill('Hej')
  await editor.press('Enter')
  await editor.press('Enter')
  await expect(panel).toContainText('hela det strömmade svaret')
  expect(
    state.requests.filter((r) => r.url === '/api/conversations')
  ).toHaveLength(1)
  const turns = state.requests.filter((r) => r.url === '/api/chat')
  expect(turns).toHaveLength(1)
  expect(turns[0].body.inputSource).toBe('text')
  expect(turns[0].body.voice).toBeUndefined()
  expect(state.requests.filter((r) => r.url === '/api/tts')).toHaveLength(0)
})
test('IME, newline, minimize and ordinary navigation preserve drafts', async ({
  page
}) => {
  const state = await setup(page)
  await page.getByRole('button', { name: 'Öppna Atlas' }).click()
  const editor = page.getByRole('textbox')
  await editor.fill('rad ett')
  await editor.dispatchEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    isComposing: true
  })
  expect(state.requests).toHaveLength(0)
  await editor.press('Shift+Enter')
  await editor.type('rad två')
  await expect(editor).toHaveValue('rad ett\nrad två')
  await page.getByRole('button', { name: 'Minimera Atlas' }).click()
  await expect(page.getByRole('button', { name: 'Öppna Atlas' })).toBeFocused()
  await page.getByRole('button', { name: '/dashboard', exact: true }).click()
  await page.getByRole('button', { name: 'Öppna Atlas' }).click()
  await expect(editor).toHaveValue('rad ett\nrad två')
  await page.getByRole('button', { name: '/atlas', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: '/dashboard', exact: true }).click()
  await expect(editor).toHaveValue('rad ett\nrad två')
})
test('pending reply survives minimizing; signout clears draft and late reply', async ({
  page
}) => {
  const state = await setup(page)
  state.hold()
  await page.getByRole('button', { name: 'Öppna Atlas' }).click()
  await page.getByRole('textbox').fill('Fråga')
  await page.getByRole('button', { name: 'Skicka', exact: true }).click()
  await expect
    .poll(() => state.requests.filter((x) => x.url === '/api/chat').length)
    .toBe(1)
  await page.getByRole('textbox').fill('oskickat utkast')
  await page.getByRole('button', { name: 'Minimera Atlas' }).click()
  await page.getByRole('button', { name: '/dashboard', exact: true }).click()
  state.release()
  await page.getByRole('button', { name: 'Öppna Atlas' }).click()
  await expect(page.getByRole('textbox')).toHaveValue('oskickat utkast')
  await expect(page.getByRole('dialog')).toContainText(
    'hela det strömmade svaret'
  )
  await page.getByRole('button', { name: 'Fixture signout' }).click()
  await page.getByRole('button', { name: 'Öppna Atlas' }).click()
  await expect(page.getByRole('textbox')).toHaveValue('')
  await expect(page.getByRole('dialog')).not.toContainText(
    'hela det strömmade svaret'
  )
})
test('denied mic leaves text editable', async ({ page }) => {
  await setup(page, true)
  await page.getByRole('button', { name: 'Öppna Atlas' }).click()
  await page.getByRole('button', { name: 'Starta samtal' }).click()
  await expect(page.getByRole('dialog')).toContainText('text')
  await expect(page.getByRole('textbox')).toBeEditable()
  await expect(
    page.getByRole('button', { name: 'Starta samtal' })
  ).toBeVisible()
})
test('voice is explicit and minimize does not hang up', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: 'Öppna Atlas' }).click()
  await page.getByRole('button', { name: 'Starta samtal' }).click()
  await expect(
    page.getByRole('button', { name: 'Avsluta samtal' })
  ).toBeVisible()
  const stops = await page.evaluate(() => (window as any).micStops)
  await page.getByRole('button', { name: 'Minimera Atlas' }).click()
  expect(await page.evaluate(() => (window as any).micStops)).toBe(stops)
  await page.getByRole('button', { name: 'Öppna Atlas' }).click()
  await page.getByRole('button', { name: 'Avsluta samtal' }).click()
  await expect(
    page.getByRole('button', { name: 'Starta samtal' })
  ).toBeVisible()
})
for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 }
]) {
  test('panel stays inside viewport ' + viewport.width, async ({ page }) => {
    await page.setViewportSize(viewport)
    await setup(page)
    await page.getByRole('button', { name: 'Öppna Atlas' }).click()
    const panel = page.getByRole('dialog'),
      box = await panel.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(8)
    expect(box!.y).toBeGreaterThanOrEqual(8)
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width - 8)
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height - 8)
    await page.screenshot({
      path:
        '../../.superpowers/sdd/2026-10-15-atlas-overview-messenger-plan/mini-' +
        viewport.width +
        '.png'
    })
    await page.setViewportSize({ width: 350, height: 400 })
    await expect
      .poll(async () => {
        const b = await panel.boundingBox()
        return b!.x + b!.width
      })
      .toBeLessThanOrEqual(342)
    await expect
      .poll(async () => {
        const b = await panel.boundingBox()
        return b!.y + b!.height
      })
      .toBeLessThanOrEqual(392)
  })
}

test('launcher has a 44 pixel target; header alone drags and clamps', async ({
  page
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await setup(page)
  const launcher = page.getByRole('button', { name: 'Öppna Atlas' }),
    hit = await launcher.boundingBox()
  expect(hit!.width).toBeGreaterThanOrEqual(44)
  expect(hit!.height).toBeGreaterThanOrEqual(44)
  await launcher.click()
  const panel = page.getByRole('dialog'),
    header = panel.locator('[data-mini-chat-drag]')
  const before = await panel.boundingBox(),
    h = await header.boundingBox()
  await page.mouse.move(h!.x + 80, h!.y + 20)
  await page.mouse.down()
  await page.mouse.move(h!.x - 180, h!.y - 80, { steps: 8 })
  await page.mouse.up()
  await expect
    .poll(async () => Math.round((await panel.boundingBox())!.x))
    .toBeLessThan(Math.round(before!.x) - 100)
  const after = await panel.boundingBox(),
    editor = page.getByRole('textbox'),
    e = await editor.boundingBox()
  await page.mouse.move(e!.x + 30, e!.y + 20)
  await page.mouse.down()
  await page.mouse.move(e!.x - 30, e!.y - 30)
  await page.mouse.up()
  expect(Math.round((await panel.boundingBox())!.x)).toBe(Math.round(after!.x))
})
test('drafts belong to their thread and contain no persistent chat text', async ({
  page
}) => {
  await setup(page)
  await page.getByRole('button', { name: 'Öppna Atlas' }).click()
  await page.getByRole('textbox').fill('Skicka')
  await page.getByRole('button', { name: 'Skicka', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText(
    'hela det strömmade svaret'
  )
  await page.getByRole('textbox').fill('utkast A')
  await page.getByRole('button', { name: 'Fixture switch thread' }).click()
  await expect(page.getByRole('textbox')).toHaveValue('')
  await page.getByRole('textbox').fill('utkast B')
  await page.getByRole('button', { name: 'Fixture switch thread' }).click()
  await expect(page.getByRole('textbox')).toHaveValue('utkast A')
  const saved = await page.evaluate(() =>
    JSON.stringify({ ...localStorage, ...sessionStorage })
  )
  expect(saved).not.toContain('utkast')
  expect(saved).not.toContain('Skicka')
})
test('logout during a held reply ignores late output', async ({ page }) => {
  const state = await setup(page)
  state.hold()
  await page.getByRole('button', { name: 'Öppna Atlas' }).click()
  await page.getByRole('textbox').fill('Fråga')
  await page.getByRole('button', { name: 'Skicka', exact: true }).click()
  await expect
    .poll(() => state.requests.filter((x) => x.url === '/api/chat').length)
    .toBe(1)
  await page.getByRole('button', { name: 'Fixture signout' }).click()
  state.release()
  await page.getByRole('button', { name: 'Öppna Atlas' }).click()
  await expect(page.getByRole('dialog')).not.toContainText(
    'hela det strömmade svaret'
  )
  await expect(page.getByRole('textbox')).toHaveValue('')
})
test('mobile visual viewport keyboard leaves the composer reachable', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page)
  await page.getByRole('button', { name: 'Öppna Atlas' }).click()
  await page.evaluate(() => {
    const viewport = Object.assign(new EventTarget(), {
      offsetLeft: 0,
      offsetTop: 250,
      width: 390,
      height: 350
    })
    Object.defineProperty(window, 'visualViewport', {
      value: viewport,
      configurable: true
    })
    window.dispatchEvent(new Event('resize'))
  })
  await expect
    .poll(async () =>
      Math.round((await page.getByRole('dialog').boundingBox())!.y)
    )
    .toBeGreaterThanOrEqual(258)
  const box = await page.getByRole('textbox').boundingBox()
  expect(box!.y + box!.height).toBeLessThanOrEqual(592)
})

test('mobile launcher clears the existing activity toggle', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page)
  const orb = await page
    .getByRole('button', { name: 'Öppna Atlas' })
    .boundingBox()
  // MobileRailToggle occupies bottom:20, right:20, 44px; it stays present on project pages below lg.
  const activity = { x: 326, y: 780, width: 44, height: 44 }
  expect(orb!.y + orb!.height).toBeLessThanOrEqual(activity.y - 8)
})

test('message links preserve the shell and unsent draft', async ({ page }) => {
  const state = await setup(page)
  await page.route('**/api/chat', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      body:
        'data: ' +
        JSON.stringify({
          event: 'text',
          text: '[Öppna översikten](/dashboard)'
        }) +
        '\n\ndata: {"event":"done"}\n\n'
    })
  )
  await page.getByRole('button', { name: 'Öppna Atlas' }).click()
  await page.getByRole('textbox').fill('Länk')
  await page.getByRole('button', { name: 'Skicka', exact: true }).click()
  const link = page.getByRole('link', { name: 'Öppna översikten', exact: true })
  await expect(link).toBeVisible()
  await page.getByRole('textbox').fill('behåll detta utkast')
  const token = await page.evaluate(() => (window as any).fixtureToken)
  await link.click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('textbox')).toHaveValue('behåll detta utkast')
  expect(await page.evaluate(() => (window as any).fixtureToken)).toBe(token)
})
test('the real full chat reuses the compact thread, and Atlas has its own surface', async ({
  page
}) => {
  const state = await setup(page)
  await page.getByRole('button', { name: 'Öppna Atlas' }).click()
  await page.getByRole('textbox').fill('Hej från lilla chatten')
  await page.getByRole('button', { name: 'Skicka', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText(
    'hela det strömmade svaret'
  )
  await page.getByRole('textbox').fill('utkast att behålla')
  await page.getByRole('button', { name: '/chat/' + C, exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    page.getByText('Hej från lilla chatten', { exact: true })
  ).toBeVisible()
  expect(
    state.requests.filter((r) => r.url === '/api/conversations')
  ).toHaveLength(1)
  await page
    .getByRole('button', { name: '/projects/test-project', exact: true })
    .click()
  await expect(page.getByRole('textbox')).toHaveValue('utkast att behålla')
  await page.getByRole('button', { name: '/atlas', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    page.locator('nav[aria-label="Bygg hemsida med Atlas"]')
  ).toHaveCount(0)
})
test('Markdown never injects raw HTML or javascript links', async ({
  page
}) => {
  await setup(page)
  await page.route('**/api/chat', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      body:
        'data: ' +
        JSON.stringify({
          event: 'text',
          text: '<img src=x onerror="window.compromised=true"> [Test](javascript:alert(1))'
        }) +
        '\n\ndata: {"event":"done"}\n\n'
    })
  )
  await page.getByRole('button', { name: 'Öppna Atlas' }).click()
  await page.getByRole('textbox').fill('Visa')
  await page.getByRole('button', { name: 'Skicka', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Test')
  await expect(
    page.getByRole('dialog').locator('img,script,a[href^="javascript:"]')
  ).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).compromised)).toBeUndefined()
})

test('zoom keeps the entire panel in the visual viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await setup(page)
  await page.getByRole('button', { name: 'Öppna Atlas' }).click()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.5 })
  await expect
    .poll(async () =>
      page.getByRole('dialog').evaluate((element) => {
        const r = element.getBoundingClientRect(),
          v = visualViewport!
        return (
          r.left >= v.offsetLeft + 7 &&
          r.top >= v.offsetTop + 7 &&
          r.right <= v.offsetLeft + v.width - 7 &&
          r.bottom <= v.offsetTop + v.height - 7
        )
      })
    )
    .toBe(true)
})

test('pending conversation creation remains busy after minimize and reopen', async ({
  page
}) => {
  await setup(page)
  let release = () => {},
    creations = 0
  await page.route('**/api/conversations', async (route) => {
    creations++
    await new Promise<void>((r) => (release = r))
    await route.fulfill({ json: { id: C } })
  })
  try {
    await page.getByRole('button', { name: 'Öppna Atlas' }).click()
    await page.getByRole('textbox').fill('Första frågan')
    await page.getByRole('button', { name: 'Skicka', exact: true }).click()
    await expect.poll(() => creations).toBe(1)
    await page.getByRole('button', { name: 'Minimera Atlas' }).click()
    await page.getByRole('button', { name: 'Öppna Atlas' }).click()
    await expect(page.getByRole('textbox')).toBeDisabled()
  } finally {
    release()
  }
  await expect(page.getByRole('textbox')).toBeEditable()
  await expect(page.getByRole('dialog')).toContainText('Första frågan')
})
test('switching threads allows a new turn while the old one is pending', async ({
  page
}) => {
  await setup(page)
  let release = () => {},
    oldStarted = false
  await page.route('**/api/chat', async (route) => {
    const body = route.request().postDataJSON()
    if (body.conversation_id === C) {
      oldStarted = true
      await new Promise<void>((r) => (release = r))
      return route.fulfill({
        status: 503,
        json: { error: 'old request failed' }
      })
    }
    return route.fulfill({
      contentType: 'text/event-stream',
      body: 'data: {"event":"text","text":"Nytt svar"}\n\ndata: {"event":"done"}\n\n'
    })
  })
  try {
    await page.getByRole('button', { name: 'Öppna Atlas' }).click()
    await page.getByRole('textbox').fill('Gammal fråga')
    await page.getByRole('button', { name: 'Skicka', exact: true }).click()
    await expect.poll(() => oldStarted).toBe(true)
    await page.getByRole('button', { name: 'Fixture switch thread' }).click()
    await page.getByRole('textbox').fill('Ny fråga')
    await expect(
      page.getByRole('button', { name: 'Skicka', exact: true })
    ).toBeEnabled()
    await page.getByRole('button', { name: 'Skicka', exact: true }).click()
    await expect(page.getByRole('dialog')).toContainText('Nytt svar')
    await page.getByRole('textbox').fill('Utkast i nya tråden')
  } finally {
    release()
  }
  await page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r()))
      )
  )
  await expect(page.getByRole('textbox')).toHaveValue('Utkast i nya tråden')
  await expect(page.getByRole('dialog').getByRole('status')).toHaveCount(0)
})

test('a typed draft follows voice-first creation without resurfacing in a new thread', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: 'Öppna Atlas' }).click()
  await page.getByRole('textbox').fill('Oskickat medan jag pratar')
  await page.getByRole('button', { name: 'Fixture voice create' }).click()
  await expect(page.getByRole('textbox')).toHaveValue('Oskickat medan jag pratar')
  await page.getByRole('button', { name: 'Fixture switch thread' }).click()
  await expect(page.getByRole('textbox')).toHaveValue('')
  await page.getByRole('button', { name: 'Fixture switch thread' }).click()
  await expect(page.getByRole('textbox')).toHaveValue('Oskickat medan jag pratar')
  await page.getByRole('button', { name: 'Fixture new thread' }).click()
  await expect(page.getByRole('textbox')).toHaveValue('')
  await page.getByRole('textbox').fill('Separat nytt utkast')
  await page.getByRole('button', { name: 'Fixture switch thread' }).click()
  await expect(page.getByRole('textbox')).toHaveValue('')
})
test('short keyboard viewport keeps text and controls reachable after microphone failure', async ({ page }) => {
  await page.setViewportSize({width: 390, height: 200})
  await setup(page, true)
  await page.getByRole('button', { name: 'Öppna Atlas' }).click()
  await page.getByRole('textbox').fill('rad ett\nrad två\nrad tre')
  await page.getByRole('button', { name: 'Starta samtal' }).click()
  await expect(page.getByRole('dialog')).toContainText('text')
  const panel = page.getByRole('dialog')
  for (const control of [page.getByRole('textbox'),
    panel.getByRole('button', {name: 'Skicka', exact: true}),
    panel.getByRole('button', {name: 'Minimera Atlas'})]) {
    await expect.poll(async () => {
      const outer=await panel.boundingBox(), inner=await control.boundingBox()
      return !!outer && !!inner && inner.y>=outer.y && inner.y+inner.height<=outer.y+outer.height
    }).toBe(true)
  }
  await page.getByRole('textbox').fill('Jag kan fortfarande skriva')
  await page.getByRole('button', {name: 'Skicka', exact: true}).click()
  await expect(panel).toContainText('hela det strömmade svaret')
})

test('long live transcript scrolls without hiding the composer', async ({page}) => {
  await page.setViewportSize({width: 390, height: 350})
  await setup(page)
  await page.getByRole('button', { name: 'Öppna Atlas' }).click()
  await page.getByRole('button', { name: 'Starta samtal' }).click()
  await expect(page.getByRole('button', {name: 'Avsluta samtal'})).toBeVisible()
  await page.evaluate(() => (window as any).fixtureRecognition.onresult({
    results: [[{ transcript: 'En lång talad mening '.repeat(60) }]]
  }))
  const panel = page.getByRole('dialog'), editor=page.getByRole('textbox')
  await expect(panel).toContainText('En lång talad mening')
  const outer=await panel.boundingBox(), inner=await editor.boundingBox()
  expect(inner!.y+inner!.height).toBeLessThanOrEqual(outer!.y+outer!.height)
  await page.getByRole('button', {name: 'Avsluta samtal'}).click()
  await editor.fill('Text efter samtalet')
  await expect(editor).toHaveValue('Text efter samtalet')
})

for(const width of [390,1280])for(const entry of ['panel','hotkey'] as const)test('live global voice '+entry+' opens persistent conversation without legacy recognition at '+width,async({page})=>{
 await setup(page)
 await page.setViewportSize({width,height:844})
 await page.goto('/dashboard?voice-live=1')
 await page.getByRole('button',{name:'Öppna Atlas',exact:true}).click()
 await expect(page.getByRole('dialog',{name:'Atlas chatt'}).getByRole('textbox')).toBeFocused()
 if(entry==='panel'){
  const panel=page.getByRole('dialog',{name:'Atlas chatt'})
  await panel.getByRole('textbox').fill('Behåll mitt utkast.')
  await panel.getByRole('button',{name:'Starta samtal',exact:true}).click()
 }else await page.keyboard.press('Alt+Space')
 await expect(page).toHaveURL(/\/dashboard\?voice-live=1$/)
 await expect(page.getByRole('region',{name:'Atlas röstsamtal'})).toBeVisible()
 await expect(page.getByRole('dialog',{name:'Atlas chatt'})).toBeHidden()
 expect(await page.evaluate(()=>(window as any).micStarts)).toBe(0)
 await page.getByRole('button',{name:'Avsluta röstsamtalet'}).click()
 if(entry==='panel'){
  await page.getByRole('button',{name:'/projects/test-project',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'Atlas chatt'}).getByRole('textbox')).toHaveValue('Behåll mitt utkast.')
 }
})
test('live global voice read-only hotkey cannot start either voice engine',async({page})=>{
 await setup(page);await page.goto('/dashboard?voice-live=1&role=collaborator')
 await page.getByRole('button',{name:'Öppna Atlas',exact:true}).click()
 await expect(page.getByRole('dialog',{name:'Atlas chatt'}).getByRole('textbox')).toBeFocused()
 await page.keyboard.press('Alt+Space')
 await expect(page).toHaveURL(/dashboard\?voice-live=1&role=collaborator$/)
 expect(await page.evaluate(()=>(window as any).micStarts)).toBe(0)
})
