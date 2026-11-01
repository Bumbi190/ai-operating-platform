import {escapeHtml as e} from '../preview-runtime'
import type {WebsiteBehavior,WebsiteDraft} from '../types'
import {premiumDealerStyle} from './premium-dealer-style'

export type DealerRaster={src:string;width:number;height:number;alt:string}
export type DealerCar={id:string;name:string;fuel:'el'|'hybrid'|'bensin';year:number;km:number;price:number;image:DealerRaster;spin?:DealerRaster[]}
export type PremiumDealerInput={brand:string;subtitle:string;hero:DealerRaster;cars:DealerCar[];accent?:string}
const labels={el:'El',hybrid:'Hybrid',bensin:'Bensin'}
const amount=(value:number)=>new Intl.NumberFormat('sv-SE').format(value)
function text(value:unknown,max=160):asserts value is string{if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('INVALID_DEALER_TEXT')}
function raster(image:DealerRaster){
 if(!image||typeof image.src!=='string'||image.src.length>180000||!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image.src)||image.src.split(',')[1].length%4!==0)throw Error('INVALID_DEALER_IMAGE')
 for(const n of [image.width,image.height])if(!Number.isInteger(n)||n<1||n>8192)throw Error('INVALID_DEALER_IMAGE_SIZE')
 text(image.alt,200)
}
function validate(input:PremiumDealerInput){
 if(!input||!Array.isArray(input.cars)||input.cars.length<1||input.cars.length>16)throw Error('INVALID_DEALER_CATALOG')
 text(input.brand,80);text(input.subtitle,80);raster(input.hero)
 const ids=['lager','om','kontakt','inventory-heading','fuel','count','empty']
 for(const car of input.cars){
  if(!car||typeof car.id!=='string'||!/^[a-z][a-z0-9-]{0,39}$/.test(car.id))throw Error('INVALID_DEALER_ID')
  text(car.name,100)
  if(!Object.hasOwn(labels,car.fuel))throw Error('INVALID_DEALER_FUEL')
  if(!Number.isInteger(car.year)||car.year<1900||car.year>2100)throw Error('INVALID_DEALER_YEAR')
  for(const n of [car.km,car.price])if(!Number.isSafeInteger(n)||n<0||n>100000000)throw Error('INVALID_DEALER_NUMBER')
  raster(car.image)
  if(car.spin){
   if(car.spin.length<4||car.spin.length>36)throw Error('INVALID_DEALER_SPIN')
   car.spin.forEach(raster)
   if(new Set(car.spin.map(frame=>frame.width+'x'+frame.height)).size!==1)throw Error('INVALID_DEALER_SPIN_SIZE')
   ids.push(car.id+'-spin-title',car.id+'-spin-control',...car.spin.map((_,i)=>car.id+'-spin-'+i))
  }
  ids.push(car.id,...['interest','form','vehicle','message'].map(s=>car.id+'-'+s))
 }
 if(new Set(ids).size!==ids.length)throw Error('INVALID_DEALER_ID')
}
function imageHtml(image:DealerRaster,lazy=false){return `<img src="${image.src}" width="${image.width}" height="${image.height}" alt="${e(image.alt)}"${lazy?' loading="lazy" decoding="async"':''}>`}
function spinHtml(car:DealerCar){
 if(!car.spin)return ''
 const frames=car.spin.map((frame,i)=>`<img id="${car.id}-spin-${i}" src="${frame.src}" width="${frame.width}" height="${frame.height}" alt="${e(frame.alt)}" loading="lazy" decoding="async"${i?' hidden':''}>`).join('')
 return `<section class="spin-demo" aria-labelledby="${car.id}-spin-title"><div class="spin-heading"><h4 id="${car.id}-spin-title">360° konceptvy</h4><span>${car.spin.length} renderade vinklar</span></div><div class="spin-stage">${frames}</div><label class="spin-control" for="${car.id}-spin-control">Dra för att rotera bilen<input id="${car.id}-spin-control" type="range" min="0" max="${car.spin.length-1}" step="1" value="0" aria-label="Rotera den fiktiva konceptbilen"></label><p class="spin-note">Interaktiv fotosekvens av en fiktiv 3D-renderad konceptbil. Detta är en 360° demo, inte en digital tvilling av ett verkligt fordon.</p></section>`
}

/** Reusable static draft template, not an agent call or an approval. Caller supplies vetted raster assets. */
export function createPremiumDealerDraft(input:PremiumDealerInput):WebsiteDraft{
 validate(input)
 const accent=input.accent??'#efb563',css=premiumDealerStyle(accent),hasSpin=input.cars.some(c=>!!c.spin)
 const behaviors:WebsiteBehavior[]=[{kind:'filter',triggerId:'fuel',targetIds:input.cars.map(c=>c.id),attribute:'data-fuel',emptyId:'empty',countId:'count'}]
 for(const c of input.cars){
  behaviors.push({kind:'toggle',triggerId:c.id+'-interest',targetIds:[c.id+'-form']})
  if(c.spin)behaviors.push({kind:'spin',triggerId:c.id+'-spin-control',targetIds:c.spin.map((_,i)=>c.id+'-spin-'+i)})
 }
 const cards=input.cars.map((c,i)=>`<article class="car" id="${c.id}" data-fuel="${c.fuel}">
 <div class="card-top"><span>OMNIRA CONCEPT / ${String(i+1).padStart(2,'0')}</span><span class="badge ${c.fuel}">${labels[c.fuel]}</span></div>
 <div class="car-image">${imageHtml(c.image,true)}</div>
 <div class="car-body"><div class="car-heading"><h3>${e(c.name)}</h3><strong class="price">${amount(c.price)} kr</strong></div>
 <p class="spec-line">${c.year}<span>·</span>${amount(c.km)} km<span>·</span>${labels[c.fuel]}</p></div>
 <details><summary>Utforska ${e(c.name)}</summary><div class="detail-body"><p>Fiktivt exempel ${e(c.id.toUpperCase())}. Pris och fordonsfakta är påhittade. Bilden är en AI-illustration, inte ett fotografi av en lagerbil.</p>
 ${spinHtml(c)}
 <dl><div><dt>Årsmodell</dt><dd>${c.year}</dd></div><div><dt>Körsträcka</dt><dd>${amount(c.km)} km</dd></div><div><dt>Drivlina</dt><dd>${labels[c.fuel]}</dd></div><div><dt>Exempelpris</dt><dd>${amount(c.price)} kr</dd></div></dl>
 <button class="button" id="${c.id}-interest" aria-expanded="false" aria-controls="${c.id}-form">Visa testförfrågan</button>
 <section id="${c.id}-form" hidden><h4>Testförfrågan för ${e(c.name)}</h4><p class="demo-note">Endast demonstration. Inget skickas och inga uppgifter sparas.</p>
 <form><label for="${c.id}-vehicle">Vald bil</label><input id="${c.id}-vehicle" name="vehicle" value="${e(c.name+' · '+c.id.toUpperCase())}" readonly>
 <label for="${c.id}-message">Ditt testmeddelande</label><textarea id="${c.id}-message" rows="3" placeholder="Skriv bara testtext, inga personuppgifter."></textarea><button type="submit" class="button outline">Testa knappen – inget skickas</button></form></section></div></details></article>`).join('')
 const count=input.cars.length,countWord=count===8?'åtta':String(count)
 const bodyHtml=`<a class="skip" href="#lager">Hoppa till bilarna</a>
 <div class="notice"><span class="diamond" aria-hidden="true">✧</span><strong>FIKTIV DEMO</strong> – Ingen verklig försäljning. AI-illustrationer, inte riktiga lagerbilar.</div>
 <header class="site-header"><div class="nav shell"><a class="brand" href="#">${e(input.brand)}<small>${e(input.subtitle)}</small></a>
 <nav class="nav-links" aria-label="Huvudnavigation"><a href="#lager">Utforska bilar</a><a href="#om">Om demon</a><a href="#kontakt">Kontakt</a></nav><a class="button outline" href="#lager"><span class="arrow" aria-hidden="true">→</span>Utforska bilar</a></div></header>
 <main><section class="hero"><div class="hero-inner shell"><div class="hero-copy"><p class="kicker">En idé från Omnira Web Studio</p><h1>En ny vy<br>på <em>bilaffären.</em></h1>
 <p class="intro">Utforska ${countWord} fiktiva konceptbilar. Välj drivlina, öppna detaljer och prova nästa steg – utan att någonting skickas.</p><a class="button" href="#lager">Utforska konceptbilarna<span class="arrow" aria-hidden="true">→</span></a></div></div>
 <figure class="scene">${imageHtml(input.hero)}<figcaption class="scene-note">${hasSpin?'<strong>Ett showroom att utforska.</strong><br>360°-konceptvy finns i första bilen. Fri 3D ingår ännu inte.':'<strong>Ett showroom att inspireras av.</strong><br>AI-genererad stillbild. Interaktiv 3D ingår inte i denna version.'}</figcaption></figure></section>
 <div class="shell"><section class="inventory" id="lager" aria-labelledby="inventory-heading"><div class="section-head"><div><p class="kicker">${e(countWord)} bilar. Nya perspektiv.</p><h2 id="inventory-heading">Hitta ditt nästa perspektiv.</h2>
 <p class="description">Alla fordonsfakta och priser är påhittade exempel.<br>AI-genererade illustrationer återanvänds för att visa designen, inte faktiska fordon.</p></div>
 <div class="filter"><label for="fuel">Filtrera på drivlina</label><select id="fuel"><option value="*">Alla drivlinor</option><option value="el">El</option><option value="hybrid">Hybrid</option><option value="bensin">Bensin</option><option value="vatgas">Vätgas - inga exempel ännu</option></select></div></div>
 <p class="count" id="count" role="status">${count} av ${count} visas</p><p class="empty" id="empty" hidden>Inga exempelbilar matchar. Välj Alla drivlinor för att återställa listan.</p><div class="catalog">${cards}</div></section>
 <section class="about" id="om"><div><p class="kicker">Digitalt showroom. Mänsklig känsla.</p><h2>Mer än en lista.<br>En första upplevelse.</h2></div><div><p>Här provar vi hur en tydlig bilöversikt och ett filmiskt uttryck kan samspela. Bilderna är AI-genererade konceptillustrationer. Uppgifter, priser och namn är exempel.</p><p>Filtrering, detaljer och testformulär fungerar lokalt.${hasSpin?' Första konceptbilen har en interaktiv 360°-bildsekvens från tolv renderade vinklar.':''} En fotosekvens är inte samma sak som en fri 3D-modell: verklig GLB/Three.js-visning och kundpublicering återstår. Handlarbörsens B2B-marknadsplats ändras inte.</p></div></section>
 <section class="contact" id="kontakt"><div><h2>Hittat ditt nästa perspektiv?</h2><p>Välj en konceptbil och prova intresseflödet. Inget skickas eller sparas.</p></div><a class="button outline" href="#lager">Utforska bilarna<span class="arrow" aria-hidden="true">→</span></a></section></div></main>
 <footer class="premium-footer"><div class="shell">
  <div class="footer-grid">
   <div class="footer-brand"><a class="footer-logo" href="#">${e(input.brand)}<small>${e(input.subtitle)}</small></a><p>Digitalt showroom med tydlig struktur, premiumkänsla och fokus på nästa steg.</p></div>
   <nav class="footer-links" aria-label="Utforska"><h3>Utforska</h3><a href="#lager">Bilar</a><a href="#om">Om demon</a><a href="#kontakt">Kontakt</a></nav>
   <div class="footer-links"><h3>Demo & transparens</h3><span>Fiktiv demonstration</span><span>AI-genererade konceptbilder</span><span>Ingen verklig försäljning</span></div>
   <div class="footer-statement"><p class="kicker">Omnira Web Studio</p><h3>Byggd för nästa affär.</h3><p>En modern bilhandel förtjänar en digital upplevelse med samma precision som bilarna den representerar.</p><a class="footer-action" href="#kontakt"><span>Se vad vi kan skapa</span><span class="footer-action-arrow" aria-hidden="true">↗</span></a></div>
  </div>
  <div class="footer-bottom"><span>${e(input.brand)} ${e(input.subtitle)} · Fiktiv demonstration</span><span>Omnira Web Studio · Konceptpreview</span></div>
 </div></footer>`
 return {format:'static-website.v1',title:input.brand+' '+input.subtitle+' – premiumdemo',css,pages:[{key:'index',title:input.brand+' '+input.subtitle+' – fiktivt showroom',bodyHtml,behaviors}]}
}
