/** Browser-only predicate: reject empty SPA loaders before collecting evidence. */
export function hasMeaningfulRenderedWebsite(){
  const text=(document.body?.innerText??'').replace(/\s+/g,' ').trim()
  const visible=element=>{const rect=element.getBoundingClientRect(),style=getComputedStyle(element);return rect.width>0&&rect.height>0&&style.display!=='none'&&style.visibility!=='hidden'}
  const headings=[...document.querySelectorAll('h1,h2,h3,main,article')].some(element=>visible(element)&&((element.innerText??'').trim().length>8))
  const controls=[...document.querySelectorAll('a,button')].filter(visible).length
  // Informational static pages may have no heading or more than one control.
  const substantialParagraph=[...document.querySelectorAll('p')].some(element=>visible(element)&&((element.innerText??'').trim().length>=40))
  return text.length>=60&&(headings||controls>=2||(text.length>=120&&substantialParagraph))
}
