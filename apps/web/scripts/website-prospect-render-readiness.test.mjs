import {test} from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from '@playwright/test'
import {existsSync} from 'node:fs'
import {hasMeaningfulRenderedWebsite} from './website-prospect-render-readiness.mjs'

test('SPA loader cannot be saved as website evidence before hydration',async()=>{
  const chrome=process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':undefined
  const browser=await chromium.launch({headless:true,...(chrome&&existsSync(chrome)?{executablePath:chrome}:{})})
  try{
    for(const width of [390,1440]){
      const page=await browser.newPage({viewport:{width,height:900}})
      await page.setContent('<!doctype html><html><body><div id="root"><div class="loader">Loading...</div></div></body></html>')
      assert.equal(await page.evaluate(hasMeaningfulRenderedWebsite),false)
      await page.evaluate(()=>{setTimeout(()=>{document.querySelector('#root').innerHTML='<main><h1>Riktig företagshemsida</h1><p>Handla bilar tryggt i Hässleholm med tydliga fordonsbeskrivningar, finansieringsalternativ och direkt kontakt med bilhandlaren.</p><a href="#cars">Bilar i lager</a></main>'},150)})
      await page.waitForFunction(hasMeaningfulRenderedWebsite,null,{timeout:2000})
      assert.equal(await page.evaluate(hasMeaningfulRenderedWebsite),true)
      await page.close()
    }
    const staticPage=await browser.newPage()
    await staticPage.setContent('<!doctype html><html><body><p>En tydlig informationssida med praktiska instruktioner, företagsinformation och ett komplett innehåll utan att någon interaktiv teknik behövs.</p><p>Det här är en stabil HTML-sida där ingen huvudrubrik krävs för att texten ska vara verklig.</p></body></html>')
    assert.equal(await staticPage.evaluate(hasMeaningfulRenderedWebsite),true)
    await staticPage.close()
  }finally{await browser.close()}
})
