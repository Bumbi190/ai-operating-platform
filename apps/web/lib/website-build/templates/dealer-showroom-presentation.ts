import {escapeHtml} from '../preview-runtime'
import {premiumDealerStyle} from './premium-dealer-style'

/** Photo sources come from the caller's vetted asset bundle or tenant-scoped photo route. */
export type ShowroomVehicle = {
  id: string
  name: string
  price: number
  year: number
  mileage: number
  fuel: string
  sold: boolean
  photos: string[]
}

const e = escapeHtml
const filterFuels = ['El', 'Hybrid', 'Bensin', 'Diesel'] as const
const amount = new Intl.NumberFormat('sv-SE')

function hero(brand: string, car: ShowroomVehicle) {
  const img = car.photos[0]
  return `<section class="dh-hero" aria-labelledby="dh-title">
    ${img ? `<img class="dh-cover" src="${e(img)}" alt="">` : ''}
    <div class="shell dh-hero-inner"><p class="dh-eyebrow">${e(brand)} · ${car.sold?'Såld':'Utvald visning'}</p>
    <h1 id="dh-title">${e(car.name)}</h1>
    <p class="dh-intro">${car.year} <span>·</span> ${e(car.fuel)} <span>·</span> ${amount.format(car.mileage)} mil</p>
    <a class="button" href="#bil-${e(car.id)}">Se visningsbilen <span aria-hidden="true">↘</span></a></div>
  </section>`
}

function card(car: ShowroomVehicle, featured: boolean) {
  const name = e(car.name)
  const facts = [
    ['Årsmodell', String(car.year)], ['Mätarställning', amount.format(car.mileage)+' mil'],
    ['Drivmedel', e(car.fuel)], ['Pris', amount.format(car.price)+' kr'],
  ].map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')
  const gallery = car.photos.slice(1).map((src,i)=>
    `<img src="${e(src)}" alt="${name}, bild ${i+2}" loading="lazy" decoding="async">`
  ).join('')
  return `<article id="bil-${e(car.id)}" class="vehicle${featured?' dh-featured':''}" data-vehicle-id="${e(car.id)}" data-sold="${car.sold}" data-fuel="${e(car.fuel)}">
    <div class="dh-photo">${car.photos[0] ? `<img src="${e(car.photos[0])}" alt="${name}" loading="lazy" decoding="async">` : ''}
      <span class="dh-tag">${car.sold?'Såld':featured?'Utvald bil':'I lager'}</span></div>
    <div class="dh-copy"><p class="dh-eyebrow">${e(car.fuel)} · ${car.year}</p><h3>${name}</h3>
    <p class="dh-distance">${amount.format(car.mileage)} mil</p><strong class="dh-price">${amount.format(car.price)} kr</strong></div>
    <details><summary>Visa fordonsuppgifter <span aria-hidden="true">↗</span></summary>
      <dl>${facts}</dl>${gallery ? `<div class="dh-gallery">${gallery}</div>` : ''}
    </details></article>`
}

function fuelChoices(vehicles: ShowroomVehicle[]): string {
  const available = filterFuels.filter(fuel=>vehicles.some(car=>car.fuel===fuel))
  if(available.length<2) return ''
  const options = ['Alla',...available].map((fuel,index)=>{
    const id = 'dh-fuel-'+fuel.toLowerCase()
    return `<input id="${id}" name="drivlina" type="radio"${index===0?' checked':''}><label for="${id}">${fuel}</label>`
  }).join('')
  return `<fieldset class="dh-filters"><legend>Filtrera på drivlina</legend>${options}</fieldset>`
}

/** The same semantic catalog is used by the compiled Studio draft and the Kundadmin showroom. */
export function renderDealerShowroom(brand: string, vehicles: ShowroomVehicle[]): string {
  const first = vehicles[0]
  return (first ? hero(brand,first) : `<div class="shell dh-empty-lead"><p class="dh-eyebrow">Digital bilhall</p><h1>${e(brand)}</h1></div>`) +
    `<section class="shell dh-stock" id="inventory" aria-labelledby="dh-stock-title">
      <p class="dh-eyebrow">Lager hos ${e(brand)}</p><h2 id="dh-stock-title">Bilar i hallen</h2>
      ${first ? `<p class="dh-counter">${vehicles.length} ${vehicles.length===1?'bil':'bilar'} i hallen</p>${fuelChoices(vehicles)}<div class="dh-grid">${vehicles.map((v,i)=>card(v,i===0)).join('')}</div>` :
        '<p class="dh-empty">Inga publicerade bilar.</p>'}
    </section>`
}

export function dealerShowroomCss(accent: string): string {
  return premiumDealerStyle(accent) + `
.dh-hero{position:relative;isolation:isolate;overflow:hidden;background:#0a1519;color:#fff}
.dh-cover{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:60% 56%;z-index:-2}
.dh-hero::before{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(90deg,#061015f7 0%,#061015d8 26%,#06101566 53%,transparent 85%),linear-gradient(0deg,#081317bb,transparent 52%)}
.dh-hero-inner{min-height:clamp(360px,49vw,620px);display:flex;flex-direction:column;align-items:flex-start;justify-content:center;padding-block:64px}
.dh-eyebrow{margin:0;color:var(--accent);text-transform:uppercase;font-size:11px;font-weight:650;letter-spacing:.16em}
.dh-hero h1,.dh-empty-lead h1{max-width:18ch;margin:14px 0 12px;font-size:clamp(44px,6.5vw,96px);line-height:1.02;letter-spacing:-.055em;overflow-wrap:anywhere}
.dh-intro{margin:0 0 28px;color:#e5efeb;font-size:clamp(15px,1.5vw,20px)}.dh-intro span{color:var(--accent)}
.dh-stock{padding-block:clamp(36px,6vw,76px)}.dh-stock h2{margin:9px 0;font-size:clamp(31px,4.5vw,55px);letter-spacing:-.05em}
.dh-counter,.dh-distance,.dh-empty{color:var(--muted)}.dh-counter{margin:0 0 18px;font-size:13px}
.dh-empty,.dh-empty-lead{padding-block:40px}
.dh-filters{display:none}
@supports selector(:has(input:checked)){
 .dh-filters{display:flex;flex-wrap:wrap;position:relative;gap:5px;border:0;padding:0;margin:0 0 18px;min-width:0}
 .dh-filters legend{padding:0;margin-bottom:5px;color:var(--muted);font-size:12px}
 .dh-filters input{position:absolute;width:1px;height:1px;min-height:0;padding:0;border:0;clip-path:inset(50%)}
 .dh-filters label{display:inline-grid;place-items:center;min-height:42px;padding:3px 15px;color:var(--fg);border:1px solid var(--line);border-radius:40px;cursor:pointer;font-size:13px}
 .dh-filters input:checked+label{border-color:var(--accent);font-weight:700}
 .dh-filters input:focus-visible+label{outline:2px solid var(--accent);outline-offset:2px}
 ${filterFuels.map(fuel=>'.dh-stock:has(#dh-fuel-'+fuel.toLowerCase()+':checked) .vehicle:not([data-fuel="'+fuel+'"]){display:none}').join('\n')}
}
.dh-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;align-items:start}
.vehicle{min-width:0;overflow:hidden;background:var(--panel);border:1px solid var(--line);border-radius:18px;scroll-margin-top:18px}
.dh-featured{grid-column:1/-1;border-color:var(--accent);display:grid;grid-template-columns:minmax(0,1.55fr) minmax(235px,1fr);align-items:stretch}
.dh-photo{position:relative;overflow:hidden;aspect-ratio:2.1;background:#14262a}.dh-photo img{display:block;width:100%;height:100%;object-fit:cover}
.dh-tag{position:absolute;top:14px;left:14px;padding:5px 10px;border-radius:999px;background:#102022eb;color:#f0f6f3;font-size:11px;font-weight:650;letter-spacing:.04em}
.vehicle[data-sold="true"] .dh-tag{background:#eee9df;color:#342a1e}.dh-copy{padding:20px;min-width:0}
.dh-copy h3{margin:5px 0 7px;font-size:clamp(22px,2vw,32px);letter-spacing:-.04em;line-height:1.12;overflow-wrap:anywhere}
.dh-featured .dh-copy{display:flex;flex-direction:column;justify-content:center;padding:clamp(22px,4vw,62px)}
.dh-featured h3{font-size:clamp(30px,4.3vw,64px)}.dh-distance{font-size:14px;margin:0 0 14px}
.dh-price{color:var(--fg);font-size:clamp(17px,2vw,26px)}.dh-featured .dh-photo{height:100%;min-height:240px;aspect-ratio:auto}
.vehicle details{grid-column:1/-1;border-top:1px solid var(--line)}
.vehicle summary{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:48px;padding:10px 20px;cursor:pointer;color:var(--accent);font-size:14px;font-weight:600}
.vehicle summary::-webkit-details-marker{display:none}.vehicle summary:focus-visible,.dh-hero a:focus-visible{outline:3px solid var(--accent);outline-offset:-4px}
.vehicle dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:4px 20px 20px}
.vehicle dt{color:var(--muted);font-size:12px}.vehicle dd{margin:3px 0 0;overflow-wrap:anywhere;font-weight:600}
.dh-gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:0 16px 16px}.dh-gallery img{width:100%;height:auto;border-radius:8px}
@media(max-width:800px){.dh-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dh-featured{grid-template-columns:minmax(0,1.2fr) minmax(195px,1fr)}.dh-featured .dh-photo{min-height:190px}}
@media(max-width:599px){.dh-grid,.dh-featured{grid-template-columns:minmax(0,1fr)}.dh-featured .dh-photo{aspect-ratio:1.9;height:auto;min-height:0}.dh-hero-inner{min-height:420px;justify-content:flex-end;padding-block:40px}.dh-hero::before{background:linear-gradient(0deg,#061015f5,#061015a6 49%,#0610151f 92%)}.dh-cover{object-position:center 45%}.dh-featured .dh-copy{padding:20px}}
`
}
