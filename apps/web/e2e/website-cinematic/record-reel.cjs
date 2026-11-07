// Record the authored dealer reel from the local fictional showroom.
// From apps/web: node e2e/website-cinematic/record-reel.cjs <new output directory>
// Supply REEL_FFMPEG when ffmpeg is outside PATH. Append --encode-only to retry from saved frames.
const assert = require('node:assert/strict')
const {spawn, execFileSync} = require('node:child_process')
const {createHash} = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')
const {chromium} = require('@playwright/test')

const url = 'http://127.0.0.1:19993/bilhandlare/bilhall'
const fps = 24
const ease = u => u * u * (3 - 2 * u)
const seconds = frame => frame / fps

async function take(browser, folder, viewport) {
  await fs.mkdir(folder)
  const page = await browser.newPage({viewport, deviceScaleFactor: 1.5})
  let frame = 0
  async function capture(copies = 1) {
    const bytes = await page.screenshot({type: 'jpeg', quality: 88, timeout: 30000})
    for (let i = 0; i < copies; i++) {
      await fs.writeFile(path.join(folder, String(frame++).padStart(4, '0') + '.jpg'), bytes)
    }
  }
  try {
    await page.goto(url)
    const play = page.locator('#cinema-play')
    await play.click()
    await page.waitForFunction(() => document.querySelector('#cinema-video').readyState >= 2)
    await play.click()
    await page.mouse.move(2, 2)
    // The ad player supplies its own controls. Leave the rest of the showroom intact.
    await page.addStyleTag({content: '.cinema-console{display:none!important}'})
    const {start, end} = await page.evaluate(async () => {
      await document.fonts.ready
      const card = document.querySelector('#concept-04')
      const photo = card.querySelector('img')
      photo.loading = 'eager'
      await photo.decode()
      const bounds = card.getBoundingClientRect()
      const centerCard = bounds.top + bounds.height / 2 - innerHeight / 2
      const heading = document.querySelector('#inventory-heading').getBoundingClientRect().top - 28
      const showButton = document.querySelector('#lot-open').getBoundingClientRect().bottom + 18 - innerHeight
      return {
        start: Math.round(scrollY + document.querySelector('#cinema-scene').getBoundingClientRect().top),
        end: Math.round(scrollY + Math.max(showButton, Math.min(heading, centerCard))),
      }
    })
    assert(end > start)
    const positions = []
    for (; frame < 108;) {
      const u = Math.max(0, (frame - 40) / 67)
      const position = Math.round(start + (end - start) * ease(u))
      const observed = await page.evaluate(async ({position, time}) => {
        const film = document.querySelector('#cinema-video')
        film.pause()
        if (Math.abs(film.currentTime - time) > .002) {
          await new Promise(resolve => {
            film.addEventListener('seeked', resolve, {once: true})
            film.currentTime = time
          })
        }
        scrollTo({top: position, behavior: 'instant'})
        await new Promise(requestAnimationFrame)
        return scrollY
      }, {position, time: Math.min(4.65, .04 + frame * .054)})
      assert(Math.abs(observed - position) <= 1, 'unexpected scroll position')
      positions.push(observed)
      await capture()
    }
    const steps = positions.slice(1).map((y, i) => y - positions[i])
    assert(steps.every(d => d >= 0 && d <= Math.ceil((end - start) * 1.5 / 67) + 1), 'scroll jumped')
    console.log(path.basename(folder), 'continuous scroll', start, end, 'max px/frame', Math.max(...steps))

    const open = page.locator('#lot-open')
    const button = await open.boundingBox()
    assert(button && button.y >= 0 && button.y + button.height <= viewport.height)
    await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2)
    await capture(14) // A short pause with the marketplace and the open button fully visible.
    await open.evaluate(el => el.addEventListener('click', () => {
      const dialog = document.querySelector('#lot-dialog')
      for (const animation of dialog.getAnimations({subtree: true})) {
        animation.pause()
        animation.currentTime = 0
      }
    }, {once: true}))
    // The pointer is already over the button. A locator click can re-scroll the portrait viewport.
    await page.mouse.down()
    await page.mouse.up()
    const dialog = page.locator('#lot-dialog')
    await dialog.locator('#lot-film').waitFor({state: 'visible'})
    assert(Math.abs(await page.evaluate(() => scrollY) - end) <= 1, 'opening moved the page')
    for (let i = 0; i < 9; i++) {
      await dialog.evaluate((el, time) => {
        for (const animation of el.getAnimations({subtree: true})) animation.currentTime = time
      }, i * 42.5)
      await capture()
    }
    await dialog.evaluate(el => { for (const animation of el.getAnimations({subtree: true})) animation.finish() })
    assert.equal(frame, 131)
    for (; frame < 224;) {
      const position = Math.round(1000 * ease((frame - 131) / 92))
      await page.locator('#lot-timeline').evaluate((el, n) => {
        el.value = String(n)
        el.dispatchEvent(new Event('input', {bubbles: true}))
      }, position)
      await page.waitForFunction(n => {
        const film = document.querySelector('#lot-film')
        return !film.seeking && Math.abs(film.currentTime - (film.duration - .04) * n / 1000) < .035
      }, position)
      await capture()
    }
    console.log(path.basename(folder), 'listing and cabin recorded')
    await page.locator('#lot-orbit').click()
    await page.frameLocator('#lot-stage iframe').locator('[data-model3d-state=ready]').waitFor({timeout: 30000})
    await page.locator('#lot-stage iframe').waitFor({state: 'visible'})
    const stage = await page.locator('#lot-stage').boundingBox()
    const x = stage.x + stage.width * .60, y = stage.y + stage.height * .48
    await page.mouse.move(x, y)
    await page.mouse.down()
    for (let i = 0; i < 90; i++) {
      await page.mouse.move(x - stage.width * .25 * ease(i / 89), y + 5 * Math.sin(Math.PI * i / 89))
      await capture()
    }
    await page.mouse.up()
    for (const view of ['front', 'rear', 'cabin']) {
      await page.locator('[data-lot-photo="' + view + '"]').click()
      await page.locator('#lot-photo').evaluate(photo => photo.decode())
      await capture(24)
    }
    await page.evaluate(() => {
      const card = document.createElement('div')
      card.setAttribute('popover', 'manual')
      card.innerHTML = '<div style="font-size:12px;letter-spacing:.22em;color:#e4c899">OMNIRA WEB STUDIO</div><strong style="font-size:clamp(40px,6vw,84px);line-height:1.04;letter-spacing:-.055em">Hur vill ni visa<br>era bilar?</strong><span style="color:#e4c899">Planera er hemsida med oss</span><small style="opacity:.65">info@handlarborsen.se · Omnira Web Studio</small>'
      document.body.append(card)
      card.showPopover()
      Object.assign(card.style, {inset:'0', width:'100vw', height:'100vh', maxWidth:'none', maxHeight:'none', margin:'0', padding:'8vw', boxSizing:'border-box', border:'none', background:'linear-gradient(120deg,#091720f5,#142632ed)', color:'#fff', font:'500 20px system-ui', display:'flex', flexDirection:'column', alignItems:'flex-start', justifyContent:'center', gap:'24px'})
    })
    await capture(46)
    assert.equal(seconds(frame), 18)
    console.log(path.basename(folder), frame, 'frames complete')
  } finally {
    await page.context().close()
  }
}

async function encodeReel(out, ffmpeg) {
  const assets = path.resolve('lib/website-build/studio/cinematic-assets')
  const manifestFile = path.join(assets, 'reel.json')
  const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'))
  const exports = path.join(out, 'encoded')
  await fs.mkdir(exports, {recursive: true})
  for (const format of ['wide','portrait']) {
    const frames = (await fs.readdir(path.join(out, format))).filter(name => /^\d{4}\.jpg$/.test(name)).sort()
    assert.equal(frames.length, 432, format + ' take is incomplete')
    frames.forEach((name, i) => assert.equal(name, String(i).padStart(4, '0') + '.jpg'))
  }
  function transcode(args) {
    execFileSync(ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', ...args], {stdio: 'inherit'})
  }
  const variants = [
    {key:'wide', source:'wide', filter:'scale=1152:720:flags=lanczos,pad=1280:720:64:0:color=0x09151b'},
    {key:'portrait', source:'portrait', filter:'scale=648:1152:flags=lanczos'},
    {key:'scroll', source:'wide', filter:'scale=864:540:flags=lanczos,pad=960:540:48:0:color=0x09151b'},
  ]
  const updated = []
  async function register(key) {
    const item = manifest[key], bytes = await fs.readFile(path.join(exports, item.filename))
    item.bytes = bytes.length
    item.sha256 = createHash('sha256').update(bytes).digest('hex')
    updated.push(item.filename)
  }
  for (const {key, source, filter} of variants) {
    const scrub = key === 'scroll', file = path.join(exports, manifest[key].filename)
    transcode(['-y', '-threads','1','-framerate',String(fps),'-i',path.join(out,source,'%04d.jpg'),
      '-frames:v','432','-vf',filter+',setsar=1','-an','-c:v','libx264','-profile:v','high','-preset','fast',
      '-crf',scrub?'25':'21','-maxrate',scrub?'1250k':'1650k','-bufsize',scrub?'650k':'1250k',
      '-pix_fmt','yuv420p','-g',scrub?'3':'8','-bf',scrub?'0':'1',
      ...(scrub?['-keyint_min','3','-sc_threshold','0','-refs','1']:[]),
      '-threads','2','-movflags','+faststart',file])
    const bytes = await fs.readFile(file)
    assert(bytes.length < 4*1024*1024 && bytes.indexOf('moov') > 0 && bytes.indexOf('moov') < bytes.indexOf('mdat'))
    transcode(['-xerror','-threads','1','-i',file,'-f','null','-'])
    await register(key)
    if (!scrub) {
      const posterKey = key+'Poster'
      transcode(['-y','-i',file,'-frames:v','1','-vf',key==='wide'?'scale=800:-2':'scale=432:-2',
        '-c:v','libwebp','-quality','82',path.join(exports,manifest[posterKey].filename)])
      await register(posterKey)
    }
  }
  // Only publish files after every variant has rendered and decoded successfully.
  for (const name of updated) await fs.copyFile(path.join(exports,name), path.join(assets,name))
  await fs.writeFile(manifestFile, JSON.stringify(manifest,null,2)+'\n')
}

async function main() {
  assert(process.argv[2], 'Supply a fresh output directory for the frame sequences')
  const out = path.resolve(process.argv[2])
  const ffmpeg = process.env.REEL_FFMPEG || 'ffmpeg'
  execFileSync(ffmpeg, ['-version'], {stdio:'ignore'})
  if (process.argv[3] === '--encode-only') return encodeReel(out, ffmpeg)
  await fs.mkdir(out, {recursive: true})
  const server = spawn(process.execPath, ['../../node_modules/tsx/dist/cli.mjs', '--tsconfig', 'e2e/website-cinematic/tsconfig.json', 'e2e/website-cinematic/server.ts'], {stdio:['ignore', 'pipe', 'inherit']})
  let browser
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.once('exit', code => reject(Error('Local showroom server exited: ' + code)))
      server.stdout.on('data', chunk => {
        if (chunk.toString().includes('Cinematic pilot ready on local port')) resolve()
      })
    })
    browser = await chromium.launch({args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']})
    await take(browser, path.join(out, 'wide'), {width:1280, height:800})
    await take(browser, path.join(out, 'portrait'), {width:432, height:768})
  } finally {
    if (browser) await browser.close()
    server.kill()
  }
  await encodeReel(out, ffmpeg)
}
main().catch(error => {console.error(error); process.exitCode = 1})
