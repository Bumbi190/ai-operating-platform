/* eslint-disable no-console */
/**
 * Isolated real-browser transport: actual Nova pairing page + real Python
 * NovaBridge HTTP + synthetic Atlas SSE. No Omnira account, remote API,
 * network write, deployment, credentials, or browser profile is used.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');

const DEP_ROOT = 'C:/Users/Andre/Projects/Handlarborsen';
const SOURCE_REPO = 'C:/Users/Andre/Projects/Omnira/.worktrees/nova-main-integration-20261106';
const PYTHON = 'C:/Python312/python.exe';
const SOURCE_REF = 'bea226e';
const localWeb = process.env.NOVA_TEST_LOCAL_WEB === '1';
const verifyReconnect = process.env.NOVA_TEST_RECONNECT === '1';
const multiTab = process.env.NOVA_TEST_MULTI_TAB === '1';
if (multiTab && !localWeb) throw new Error('Multi-tab session test needs QA client');
const fixtureFile = path.join(__dirname, 'bridge_fixture.py');
const previewFile = 'apps/web/app/(platform)/nova-bridge/page.tsx';

const previewSource = localWeb
  ? fs.readFileSync(path.resolve(__dirname, '..', '..', 'web', 'app', '(platform)', 'nova-bridge', 'page.tsx'),'utf8')
  : execFileSync('git', ['-C', SOURCE_REPO, 'show', SOURCE_REF + ':' + previewFile],
    { encoding: 'utf8', maxBuffer: 2_000_000 });
if (!previewSource.includes("mode: 'nova_readonly'") ||
    !previewSource.includes("targetAddressSpace: 'loopback'")) {
  throw new Error('SSO-preview source does not match tested read-only contract');
}

function responseLines(child) {
  let buffer = '';
  const ready = [];
  const waiting = [];
  child.stdout.on('data', bytes => {
    buffer += bytes.toString('utf8');
    while (buffer.includes('\n')) {
      const end = buffer.indexOf('\n');
      const row = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (!row) continue;
      const data = JSON.parse(row);
      if (waiting.length) waiting.shift()(data);
      else ready.push(data);
    }
  });
  return () => {
    if (ready.length) return Promise.resolve(ready.shift());
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Fixture timeout')), 6000);
      waiting.push(value => { clearTimeout(timer); resolve(value); });
    });
  };
}

async function main() {
  let temp = null, viteServer = null, fixture = null, browser = null;
  const browserErrors = [], apiRequests = [];
  try {
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-bridge-qa-'));
    fs.writeFileSync(path.join(temp, 'index.html'),
      '<!doctype html><html><head><meta charset="UTF-8"></head><body>' +
      '<div id="root"></div><script type="module" src="/main.jsx"></script></body></html>');
    fs.writeFileSync(path.join(temp, 'page.tsx'), previewSource);
    if (!localWeb) {
      // The deployed preview (bea226e) uses protocol v1. Test it against
      // its matching immutable Python bridge, never the new QA protocol.
      const baselineBridge = execFileSync(
        'git', ['-C', SOURCE_REPO, 'show',
          SOURCE_REF + ':apps/nova-desktop/nova_bridge.py'],
        {encoding:'utf8',maxBuffer:1_000_000}
      );
      fs.writeFileSync(path.join(temp, 'nova_bridge.py'), baselineBridge);
    }
    fs.writeFileSync(path.join(temp, 'main.jsx'),
      'import React from "react"; import {createRoot} from "react-dom/client";' +
      'import Page from "./page.tsx"; createRoot(document.getElementById("root")).render(React.createElement(Page));');

    const dependencies = path.join(DEP_ROOT, 'node_modules');
    const viteModule = pathToFileURL(require.resolve('vite', {paths:[DEP_ROOT]})).href;
    const vite = await import(viteModule);
    viteServer = await vite.createServer({
      root: temp,
      configFile: false,
      logLevel: 'error',
      esbuild: { jsx: 'automatic' },
      resolve: {alias: [
        {find: /^react$/, replacement: path.join(dependencies, 'react/index.js')},
        {find: /^react\/jsx-runtime$/, replacement: path.join(dependencies,'react/jsx-runtime.js')},
        {find: /^react\/jsx-dev-runtime$/, replacement: path.join(dependencies,'react/jsx-dev-runtime.js')},
        {find: /^react-dom\/client$/, replacement: path.join(dependencies, 'react-dom/client.js')},
      ]},
      server: {host:'127.0.0.1',port:0,strictPort:false},
      optimizeDeps: {include: []},
    });
    await viteServer.listen();
    const localOrigin = 'http://127.0.0.1:' + viteServer.httpServer.address().port;

    fixture = spawn(PYTHON, ['-u',fixtureFile,localOrigin,...(localWeb ? [] : [temp])], {
      cwd:path.dirname(fixtureFile),
      stdio:['pipe','pipe','pipe'], windowsHide:true,
    });
    let fixtureErrors = '';
    fixture.stderr.on('data',bytes => {
      fixtureErrors = (fixtureErrors + bytes.toString('utf8')).slice(-1200);
    });
    const nextLine = responseLines(fixture);
    const bridge = await nextLine();
    assert.ok(Number.isInteger(bridge.port) && bridge.port > 1024);
    assert.ok(typeof bridge.key === 'string' && bridge.key.length >= 32);

    async function cli(cmd) {
      fixture.stdin.write(JSON.stringify(cmd) + '\n');
      return nextLine();
    }

    const playwright = require(require.resolve('playwright',{paths:[DEP_ROOT]}));
    browser = await playwright.chromium.launch({headless:true});
    const ctx = await browser.newContext({serviceWorkers:'block'});
    const page = await ctx.newPage();
    page.on('pageerror', e => browserErrors.push(e.message));
    page.on('console', m => {
      if (m.type() === 'error') browserErrors.push(m.text());
    });
    page.on('request', req => {
      const u = req.url();
      if (u.startsWith('https://') ||
          (u.startsWith('http://') && !u.startsWith('http://127.0.0.1:'))) {
        browserErrors.push('Unexpected remote network request');
      }
    });

    await page.route('**/api/chat', async route => {
      const request = route.request();
      const body = request.postDataJSON();
      apiRequests.push(body);
      assert.equal(request.method(), 'POST');
      assert.deepEqual(Object.keys(body).sort(), ['messages','mode','voice']);
      assert.equal(body.mode, 'nova_readonly');
      assert.equal(body.voice, false);
      assert.equal(body.messages.at(-1).role, 'user');
      const question = body.messages.at(-1).content;
      let stream;
      if (question.includes('verktyg')) {
        stream = 'data: {"event":"tool_call","name":"send_email"}\n\n';
      } else if (question.includes('långsamt')) {
        // Simulate a slow provider call while the desktop sends Stop.
        // This never reaches Omnira, and the returned text must be ignored.
        await new Promise(resolve => setTimeout(resolve, 8500));
        stream = 'data: {"event":"text","text":"FÖRBJUDEN_SEN_TEXT"}\n\n' +
                 'data: {"event":"done"}\n\n';
      } else {
        const text = question.includes('andra') ? 'Andra QA-svaret' : 'Första QA-svaret';
        stream = 'data: ' + JSON.stringify({event:'text',text}) + '\n\n' +
                 'data: {"event":"done"}\n\n';
      }
      await route.fulfill({
        status:200, contentType:'text/event-stream; charset=utf-8', body:stream,
      });
    });

    await page.goto(
      localOrigin + '/#port=' + bridge.port + '&key=' + encodeURIComponent(bridge.key),
      {waitUntil:'domcontentloaded',timeout:20_000}
    );
    await page.getByRole('button',{name:'Anslut',exact:true}).waitFor({timeout:15_000});
    await page.waitForFunction(() => location.hash === '', null, {timeout:5000});
    assert.ok((await page.locator('body').innerText()).includes('Nova hittad lokalt'));
    await page.getByRole('button',{name:'Anslut',exact:true}).click();
    await page.waitForFunction(() => document.body.innerText.includes('Ansluten!'), null,
      {timeout:10_000});
    console.log('PASS manual browser pairing and hash-scrubbing');

    const first=await cli({cmd:'enqueue',text:'Första Atlas QA-frågan'});
    assert.equal(first.ok,true,first.message);
    await page.waitForFunction(() =>
      document.body.innerText.includes('Första QA-svaret') &&
      document.body.innerText.includes('Atlas svarade.'), null, {timeout:10_000});
    let task=await cli({cmd:'task'});
    assert.equal(task.state,'done');
    assert.ok(task.chars > 0);
    console.log('PASS browser SSE through real local HTTP relay');

    const second=await cli({cmd:'enqueue',text:'Ge mig andra statusen'});
    assert.equal(second.ok,true,second.message);
    await page.waitForFunction(() =>
      document.body.innerText.includes('Andra QA-svaret') &&
      document.body.innerText.includes('Atlas svarade.'), null, {timeout:10_000});
    task=await cli({cmd:'task'});
    assert.equal(task.state,'done');
    assert.ok(apiRequests.length>=2);
    assert.ok(apiRequests[1].messages.some(m => m.content === 'Första QA-svaret'));
    console.log('PASS browser conversation context remains local and read-only');

    if (multiTab) {
      // The second browser tab gets an explicit new session. The first must
      // lose the ability to pull work, report output or renew the heartbeat.
      const secondTab = await ctx.newPage();
      secondTab.on('pageerror',e => browserErrors.push(e.message));
      await secondTab.route('**/api/chat',async route => {
        const request=route.request().postDataJSON();
        assert.equal(request.mode,'nova_readonly');
        await route.fulfill({
          status:200,contentType:'text/event-stream; charset=utf-8',
          body:'data: {"event":"text","text":"Andra QA-svaret"}\n\n' +
               'data: {"event":"done"}\n\n',
        });
      });
      await secondTab.goto(
        localOrigin + '/#port=' + bridge.port + '&key=' + encodeURIComponent(bridge.key),
        {waitUntil:'domcontentloaded',timeout:20_000}
      );
      await secondTab.getByRole('button',{name:'Anslut',exact:true}).click();
      await secondTab.waitForFunction(() =>
        document.body.innerText.includes('Ansluten!'),null,{timeout:10_000});
      await page.waitForFunction(() =>
        document.body.innerText.includes('Kopplingen till Nova försvann.'),
        null,{timeout:10_000});
      const switched=await cli({cmd:'enqueue',text:'Ge mig andra statusen i flik två'});
      assert.equal(switched.ok,true, switched.message);
      await secondTab.waitForFunction(() =>
        document.body.innerText.includes('Andra QA-svaret') &&
        document.body.innerText.includes('Atlas svarade.'),
        null,{timeout:10_000});
      task=await cli({cmd:'task'});
      assert.equal(task.state,'done');
      assert.equal(secondTab.url().includes('#key='),false);
      console.log('PASS two-tab session takeover: first rejected, second completes');
      await cli({cmd:'quit'});
      return;
    }

    const third=await cli({cmd:'enqueue',text:'Kör ett verktyg'});
    assert.equal(third.ok,true);
    await page.waitForFunction(() =>
      document.body.innerText.includes('Atlas-svaret avbröts') &&
      document.body.innerText.includes('Atlas försökte använda ett verktyg'),
      null, {timeout:10_000});
    task=await cli({cmd:'task'});
    assert.equal(task.state,'failed');
    console.log('PASS forbidden tool call fails closed');
    assert.deepEqual(browserErrors,[],browserErrors.join(' | '));

    const pending = await cli({cmd:'enqueue',text:'Svara långsamt så att jag kan stoppa'});
    assert.equal(pending.ok,true);
    let running = false;
    const observedStates = [];
    for(let attempt=0;attempt<55;attempt++){
      task=await cli({cmd:'task'});
      observedStates.push(task.state);
      if(task.state === 'executing'){running=true;break;}
      await new Promise(resolve=>setTimeout(resolve,140));
    }
    assert.ok(running,'slow provider task should be executing before Stop; states='+
      observedStates.filter((value,index)=>index===0||value!==observedStates[index-1]).join(',')+
      '; browser='+ (await page.locator('body').innerText()).slice(0,290));
    await cli({cmd:'cancel'});
    await page.waitForFunction(() =>
      document.body.innerText.includes('Atlas-svaret avbröts') ||
      document.body.innerText.includes('avbröt'),
      null, {timeout:8_000});
    task=await cli({cmd:'task'});
    assert.equal(task.state,'canceled');
    assert.ok(!(await page.locator('body').innerText()).includes('FÖRBJUDEN_SEN_TEXT'));
    console.log('PASS canceled local task aborts browser stream without fake completion');

    await page.getByRole('button',{name:'Pausa',exact:true}).click();
    await page.waitForFunction(() =>
      document.body.innerText.includes('Kopplingen pausad.'),null,{timeout:10_000});
    console.log('PASS explicit browser pause');
    if (verifyReconnect) {
      // Immediate click after Pause used to be silently ignored because
      // pollRef.current still belonged to the old loop.
      await page.getByRole('button',{name:'Anslut',exact:true}).click();
      await page.waitForFunction(() => document.body.innerText.includes('Ansluten!'),
        null,{timeout:4500});
      const restarted=await cli({cmd:'enqueue',text:'Ge mig andra testfrågan efter paus'});
      assert.equal(restarted.ok,true);
      await page.waitForFunction(() =>
        document.body.innerText.includes('Andra QA-svaret') &&
        document.body.innerText.includes('Atlas svarade.'),
        null,{timeout:7000});
      task=await cli({cmd:'task'});
      assert.equal(task.state,'done');
      console.log('PASS paused browser reconnects immediately without losing tasks');
    }
    // A canceled task's late /event POST is intentionally rejected by
    // the local server with HTTP 409, which Chrome logs as a resource error.
    // That expected rejection proves stale output cannot be accepted.
    const unexpectedErrors = browserErrors.filter(
      message => !message.includes('status of 409 (Conflict)')
    );
    assert.deepEqual(unexpectedErrors,[],unexpectedErrors.join(' | '));
    console.log('PASS browser E2E of ' + (localWeb
      ? 'proposed v2 QA browser + v2 bridge'
      : 'immutable protected-preview v1 client/bridge commit ' + SOURCE_REF) +
      ' (no real account/API calls)');
    await cli({cmd:'quit'});
  } finally {
    try { if(browser) await browser.close(); } catch {}
    try { if(viteServer) await viteServer.close(); } catch {}
    if(fixture && !fixture.killed) {
      try {fixture.stdin.end();}catch{}
      try {fixture.kill();}catch{}
    }
    if(temp){
      try {fs.rmSync(temp,{recursive:true,force:true});}catch{}
    }
  }
}
main().catch(error=>{
  console.error('FAIL isolated browser QA:',error.message);
  process.exitCode=1;
});
