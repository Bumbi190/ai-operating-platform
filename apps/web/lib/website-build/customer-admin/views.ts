import {randomUUID} from 'node:crypto'
import {escapeHtml as escape} from '../preview-runtime'
import {renderDealerShowroom} from '../templates/dealer-showroom-presentation'
import {adminStyles, publicStyles} from './styles'

export type VehicleContent = {
  name: string
  price: number
  year: number
  mileage: number
  fuel: 'El' | 'Hybrid' | 'Bensin' | 'Diesel'
  sold: boolean
  photos: string[]
}
export type SiteContent = {
  heading: string
  description: string
  hours: string
  phone: string
  email: string
  address: string
}
type PublicationHistory = {revision: number; available?: boolean}[]
export type SiteWorkspace = {
  slug: string
  brand: string
  version: number
  draft: SiteContent | null
  published: SiteContent | null
  publishedRevision: number | null
  history: PublicationHistory
}
export type Catalog = {slug: string; brand: string; vehicles: {id: string; content: VehicleContent}[]; siteContent?: SiteContent | null}
export type AdminVehicle = {
  id: string
  version: number
  draft: VehicleContent
  published: VehicleContent | null
  publishedRevision?: number | null
  history: PublicationHistory
}
export type Workspace = {slug: string; brand: string; vehicles: AdminVehicle[]; siteContent?: SiteContent | null}

const fuels: VehicleContent['fuel'][] = ['El', 'Hybrid', 'Bensin', 'Diesel']
const money = new Intl.NumberFormat('sv-SE')
const safeHash = /^[a-f0-9]{64}$/
const text = (value: string | number) => escape(String(value))
const field = (key: string, value: string | number) => `<input type="hidden" name="${key}" value="${text(value)}">`
const segment = (value: string) => escape(encodeURIComponent(value))

function hallPath(slug: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) throw Error('INVALID_DEALER_SLUG')
  return '/hall/' + slug
}

function framed(title: string, brand: string, base: string, section: string, nav: string, main: string, styles: string): string {
  const initials = brand.trim().split(/\s+/u).slice(0,2).map(word => [...word][0]).join('').toLocaleUpperCase('sv-SE')
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${escape(title)}</title><style>${styles}</style></head>
<body><a class="skip" href="#main">Hoppa till innehållet</a>
<header class="site-header"><div class="shell nav">
<a class="wordmark" href="${base}"><span class="seal" aria-hidden="true">${escape(initials)}</span><span class="brand">${escape(brand)}<small>${section}</small></span></a>
<nav class="nav-actions" aria-label="Huvudnavigation">${nav}</nav></div></header>
${main}
<footer class="footer"><div class="shell"><p>${escape(brand)}</p><p>Fiktiv testbilhall · Omnira Web Studio</p></div></footer></body></html>`
}

function messageBlock(message?: string) {
  return message ? `<p class="feedback" role="status">${escape(message)}</p>` : ''
}

function contactHref(value: string, kind: 'phone' | 'email'): string | null {
  if (kind === 'phone') {
    const dialable = value.replace(/^(?:\+46|0046)[ .-]*\(0\)/,'+46')
    const international = dialable.startsWith('+')
    const number = international ? dialable.slice(1) : dialable
    const digits = number.replace(/\D/g,'')
    if (value.length > 40 || /[^0-9 ().-]/.test(number) || digits.length < 3 || digits.length > 20) return null
    return 'tel:'+(international ? '+' : '')+digits
  }
  if (value.length > 254 || /[^A-Za-z0-9_.+@-]/.test(value)) return null
  const match = /^([A-Za-z0-9_+-]+(?:\.[A-Za-z0-9_+-]+)*)@([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+)$/.exec(value)
  return match ? 'mailto:'+encodeURIComponent(match[1])+'@'+match[2] : null
}

function siteInfo(content: SiteContent): string {
  const rows = ([
    ['Öppettider',content.hours],['Besöksadress',content.address],
    ['Telefon',content.phone,contactHref(content.phone,'phone')],
    ['E-post',content.email,contactHref(content.email,'email')],
  ] as const).filter(([,value]) => value.trim()).map(([label,value,href]) =>
    `<div><dt>${label}</dt><dd>${href ? `<a href="${escape(href)}">${escape(value)}</a>` : escape(value)}</dd></div>`).join('')
  return `<section class="dealer-info" id="om-hallen" aria-labelledby="hall-info-title"><div class="shell dealer-info-inner">
    <div><p class="dh-eyebrow">Om hallen</p><h2 id="hall-info-title">${escape(content.heading)}</h2>
    ${content.description ? `<p class="dealer-description">${escape(content.description)}</p>` : ''}</div>
    ${rows ? `<dl class="dealer-facts">${rows}</dl>` : ''}</div></section>`
}

export function showroomView(catalog: Catalog, preview = false, previewVehicleId?: string, pagePreview = false): string {
  const base = hallPath(catalog.slug)
  const privatePreview = preview || pagePreview
  const draftPhotos = preview && !pagePreview
  const cars = catalog.vehicles.map(({id, content}) => ({
    ...content, id, photos: content.photos.filter(hash => safeHash.test(hash)).map(hash => base+'/foto/'+hash+(draftPhotos?'?utkast=1':'')),
  }))
  const selected = previewVehicleId ?? (cars.length === 1 ? cars[0].id : undefined)
  const id = draftPhotos && selected && cars.some(car => car.id === selected) ? '?bil='+segment(selected) : ''
  const banner = privatePreview ? `<aside class="preview-banner" data-preview-banner aria-label="Privat förhandsvisning"><div class="shell">
    <strong>Privat förhandsvisning av ${pagePreview?'sidans sparade utkast':'sparat utkast'}</strong><a href="${base}/admin${pagePreview?'/sidan':id}">Tillbaka till redigeringen</a></div></aside>` : ''
  const info = catalog.siteContent?.heading.trim() ? siteInfo(catalog.siteContent) : ''
  const infoLink = info ? '<a class="section-link" href="#om-hallen">Om hallen</a>' : ''
  const nav = infoLink + (privatePreview ? `<a class="button outline" href="${base}">Öppna bilhallen</a>` : '<a class="button outline" href="#inventory">Bilar i hallen</a>')
  const main = `${banner}<main id="main">${renderDealerShowroom(catalog.brand,cars)}${info}</main>`
  return framed((privatePreview?'Förhandsvisning · ':'')+catalog.brand,catalog.brand,base,'BILHALL',nav,main,publicStyles)
}

export function loginView(slug: string, message?: string): string {
  const base = hallPath(slug)
  const main = `<main class="shell signin-layout" id="main"><section class="panel signin">
    <p class="eyebrow">För handlare</p><h1>Logga in</h1>
    <p class="hint">Logga in för att hantera bilannonserna och uppgifterna om din bilhall.</p>
    ${messageBlock(message)}<form id="login-form" method="post" action="${base}/login">
    <label>E-postadress<input type="email" name="email" autocomplete="username" required></label>
    <label>Lösenord<input type="password" name="password" autocomplete="current-password" required></label>
    <button class="button" type="submit">Logga in</button></form></section></main>`
  return framed('Logga in · Kundadmin','Kundadmin',base,'HANDLARINLOGGNING',`<a class="button outline" href="${base}">Öppna bilhallen</a>`,main,adminStyles)
}

function listingStatus(vehicle: AdminVehicle): string {
  const visible = vehicle.published
  if (!visible) return 'Ej publicerad'
  const draft = vehicle.draft
  if (draft.name !== visible.name || draft.price !== visible.price || draft.year !== visible.year ||
      draft.mileage !== visible.mileage || draft.fuel !== visible.fuel || draft.sold !== visible.sold ||
      draft.photos.join(',') !== visible.photos.join(',')) return 'Opublicerade ändringar'
  return visible.sold ? 'Publicerad · Såld' : 'Publicerad'
}

function numberInput(label: string, key: string, value: number | undefined, min: number, max: number, suffix = '') {
  return `<label>${label}${suffix}<input name="${key}" type="number" inputmode="numeric" min="${min}" max="${max}" step="1" value="${value === undefined ? '' : text(value)}" required></label>`
}

function editor(base: string, vehicle?: AdminVehicle): string {
  const id = vehicle?.id ?? randomUUID()
  const draft = vehicle?.draft
  const photos = draft?.photos.filter(hash => safeHash.test(hash)) ?? []
  const keep = photos.map((hash, index) => `<label class="check">
    <img src="${base}/foto/${hash}?utkast=1" alt="${escape(draft!.name)}, bild ${index+1}" width="100" height="59">
    <span><input type="checkbox" name="keepPhoto" value="${hash}" checked>Behåll bild ${index+1}</span></label>`).join('')
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">Fordonsannons</p>
    <h2>${draft ? escape(draft.name) : 'Skapa ny annons'}</h2></div>
    <span class="tag draft">${vehicle ? listingStatus(vehicle) : 'Nytt utkast'}</span></div>
  <form id="vehicle-form" class="editor" method="post" enctype="multipart/form-data" action="${base}/admin">
    ${field('intent','save')}${field('vehicleId',id)}${field('version',vehicle?.version ?? 0)}
    <fieldset><legend>Fordonsuppgifter</legend><div class="fields">
    <label class="wide">Bilnamn<input type="text" name="name" value="${escape(draft?.name ?? '')}" maxlength="80" placeholder="Modell och variant" required></label>
    ${numberInput('Pris','price',draft?.price,0,99999999,' (kr)')}
    ${numberInput('Årsmodell','year',draft?.year,1886,2100)}
    ${numberInput('Mätarställning','mileage',draft?.mileage,0,9999999,' (mil)')}
    <label>Drivmedel<select name="fuel" required>${fuels.map(fuel => `<option value="${fuel}"${fuel === draft?.fuel ? ' selected' : ''}>${fuel}</option>`).join('')}</select></label></div>
    <label class="check"><input type="checkbox" name="sold"${draft?.sold ? ' checked' : ''}>Markera som såld</label></fieldset>
    <fieldset><legend>Foton</legend>
    <p class="hint" id="photo-hint">Välj 1–3 bilder i JPEG, PNG eller WebP. Första bilden blir annonsens omslag. Nya bilder läggs sist.</p>
    ${keep?`<div class="existing">${keep}</div>`:''}<label>Lägg till foton<input type="file" name="photos" multiple accept="image/jpeg,image/png,image/webp" aria-describedby="photo-hint"${photos.length ? '' : ' required'}></label></fieldset>
    <button type="submit" class="button">Spara utkast</button></form>
    ${vehicle ? publication(base,vehicle) : '<p class="hint">Spara utkastet för att förhandsgranska annonsen.</p>'}</section>`
}

function publication(base: string, vehicle: AdminVehicle): string {
  const ids = field('vehicleId',vehicle.id)+field('version',vehicle.version)
  const live = vehicle.published
  const liveLink = live ? `<a class="text-link" href="${base}#bil-${segment(vehicle.id)}">Se publicerad annons</a>` : ''
  const liveFacts = live ? `${escape(live.name)} · ${money.format(live.price)} kr · ${live.sold?'Såld':'I lager'}. ${liveLink}` : 'Bilhallen visar ännu ingen annons för den här bilen.'
  const options = revisionOptions(vehicle.history,vehicle.publishedRevision)
  if (live) options.push('<option value="0">Avpublicera annonsen</option>')
  const noChange = live !== null && listingStatus(vehicle) !== 'Opublicerade ändringar'
  return `<section class="commit"><p class="eyebrow">Visningen i bilhallen</p><h3>Granska och publicera</h3>
    <p class="hint">Förhandsgranskning och publicering använder ditt senast sparade utkast.</p>
    <p class="hint">Just nu i bilhallen · ${liveFacts}</p>
    <div class="actions"><a class="button outline" href="${base}/preview?bil=${segment(vehicle.id)}">Förhandsgranska utkast</a>
    <form id="publish-form" method="post" action="${base}/admin">${field('intent','publish')}${ids}
    <button class="button" type="submit"${noChange?' disabled':''}>Publicera utkast</button></form></div></section>
    ${options.length ? `<details class="history"><summary>Versionshistorik och återställning</summary>
    <p class="hint">En återställning visas direkt i bilhallen. Avpublicering tar bort den synliga annonsen och behåller utkastet.</p>
    <form id="restore-form" method="post" action="${base}/admin">${field('intent','restore')}${ids}
    <label for="restore-version">Version eller åtgärd</label><div class="actions"><select name="revision" id="restore-version" required>
    <option value="" selected disabled>Välj en version eller åtgärd</option>${options.join('')}</select>
    <button class="button outline" type="submit">Återställ version</button></div></form></details>` : ''}`
}

export function adminView(workspace: Workspace, vehicleId?: string, message?: string): string {
  const base = hallPath(workspace.slug)
  const cars = workspace.vehicles
  const selected = vehicleId ? cars.find(vehicle => vehicle.id === vehicleId) : cars[0]
  const publicCount = cars.filter(vehicle => vehicle.published !== null).length
  const sold = cars.filter(vehicle => vehicle.published?.sold).length
  const rows = cars.map(vehicle => `<li><a class="inventory-row" href="${base}/admin?bil=${segment(vehicle.id)}"${selected?.id === vehicle.id ? ' aria-current="page"' : ''}>
    <strong>${escape(vehicle.draft.name)}</strong><small>${listingStatus(vehicle)}</small></a></li>`).join('')
  const nav = adminNavigation(base,'inventory')
  const panel = selected || vehicleId === 'ny' ? editor(base,selected) : `<section class="panel">
    <p class="eyebrow">Fordonsannonser</p><h2>${vehicleId?'Annonsen finns inte i ditt lager':'Lägg upp din första bil'}</h2>
    <p class="hint">Börja med fordonsuppgifter och bilder. Du bestämmer när annonsen ska visas i bilhallen.</p></section>`
  const main = `<main id="main"><section class="worktop"><div class="shell"><div class="section-head"><div>
    <p class="eyebrow">Kundadmin · ${escape(workspace.brand)}</p><h1 class="page-title">Ditt lager</h1>
    <p class="hint">Hantera bilar, granska utkast och publicera i din bilhall.</p></div>
    <div class="actions"><a class="button" href="${base}/admin?bil=ny">Ny annons</a><a class="button outline" href="${base}">Öppna bilhallen</a></div></div>
    <div class="stats"><span class="stat"><b>${cars.length}</b> totalt</span><span class="stat"><b>${publicCount}</b> ${publicCount === 1 ? 'publicerad' : 'publicerade'}</span><span class="stat"><b>${sold}</b> ${sold === 1 ? 'såld' : 'sålda'} i bilhallen</span></div></div></section>
    ${message?`<div class="shell feedback-wrap">${messageBlock(message)}</div>`:''}<div class="shell workspace">
    <nav aria-label="Dina fordonsannonser"><h2 class="stock-heading">Dina annonser</h2>${rows?`<ul class="stock-list">${rows}</ul>`:'<p class="hint">Lagret är tomt.</p>'}</nav>
    ${panel}</div></main>`
  return framed(workspace.brand+' · Kundadmin',workspace.brand,base,'KUNDADMIN',nav,main,adminStyles)
}

function adminNavigation(base: string, selected: 'inventory' | 'site'): string {
  return `<a class="section-link" href="${base}/admin"${selected === 'inventory' ? ' aria-current="page"' : ''}>Bilannonser</a>
    <a class="section-link" href="${base}/admin/sidan"${selected === 'site' ? ' aria-current="page"' : ''}>Sidan</a>
    <form method="post" action="${base}/logout"><button type="submit" class="button outline">Logga ut</button></form>`
}

function revisionOptions(history: PublicationHistory, current?: number | null): string[] {
  return history.filter(item => item.revision > 0 && item.revision !== current).map(item =>
    `<option value="${text(item.revision)}">Version ${text(item.revision)}${item.available === false?' · avpublicerad':''}</option>`)
}

export function siteAdminView(workspace: SiteWorkspace, message?: string): string {
  const {slug,brand,version,draft,published,publishedRevision,history} = workspace
  const base = hallPath(slug)
  const action = base+'/admin/sidan'
  const currentVersion = field('version',version)
  const content = draft ?? published
  const keys = ['heading','description','hours','phone','email','address'] as const
  const upToDate = !!published && !!draft && keys.every(key => published[key] === draft[key])
  let status = draft ? 'Sparat utkast' : 'Nytt utkast'
  if (published) status = upToDate ? 'Publicerad' : 'Opublicerade ändringar'
  const options = revisionOptions(history,publishedRevision)
  if (published) options.push('<option value="0">Avpublicera siduppgifterna</option>')
  const publicLink = published ? `<a class="text-link" href="${base}#om-hallen">Se publicerade uppgifter</a>` : 'Hallen visar ännu inga uppgifter om företaget.'
  const main = `<main id="main"><section class="worktop"><div class="shell"><div class="section-head"><div>
    <p class="eyebrow">Kundadmin · ${escape(brand)}</p><h1 class="page-title">Sidan</h1>
    <p class="hint">Låt besökarna veta vilka ni är, när de kan komma förbi och hur de når er.</p></div>
    <div class="actions"><a class="button outline" href="${base}">Öppna bilhallen</a></div></div></div></section>
    ${message?`<div class="shell feedback-wrap">${messageBlock(message)}</div>`:''}
    <div class="shell page-workspace"><section class="panel"><div class="panel-heading"><div><p class="eyebrow">Bilhallens sida</p>
    <h2>Om hallen</h2></div><span class="tag${published && upToDate?'':' draft'}">${status}</span></div>
    <p class="hint">Uppgifterna visas under bilarna i hallen när du publicerar. Lämna valfria fält tomma för att dölja dem.</p>
    <form id="page-form" class="editor" method="post" action="${action}">${field('intent','save')}${currentVersion}
    <fieldset><legend>Presentation</legend><div class="fields">
    <label class="wide">Rubrik<input type="text" name="heading" maxlength="80" value="${escape(content?.heading ?? '')}" required></label>
    <label class="wide">Beskrivning <span class="optional">(valfritt)</span><textarea name="description" maxlength="1000" rows="4">${escape(content?.description ?? '')}</textarea></label></div></fieldset>
    <fieldset><legend>Besök och kontakt</legend><div class="fields">
    <label>Öppettider <span class="optional">(valfritt)</span><textarea name="hours" maxlength="400" rows="3">${escape(content?.hours ?? '')}</textarea></label>
    <label>Besöksadress <span class="optional">(valfritt)</span><textarea name="address" maxlength="180" rows="3" autocomplete="street-address">${escape(content?.address ?? '')}</textarea></label>
    <label>Telefon <span class="optional">(valfritt)</span><input type="tel" name="phone" maxlength="40" autocomplete="tel" value="${escape(content?.phone ?? '')}"></label>
    <label>E-post <span class="optional">(valfritt)</span><input type="email" name="email" maxlength="254" autocomplete="email" value="${escape(content?.email ?? '')}"></label></div></fieldset>
    <button type="submit" class="button">Spara utkast</button></form>
    <section class="commit"><p class="eyebrow">Visningen i bilhallen</p><h3>Granska och publicera</h3>
    <p class="hint">${draft?'Förhandsgranskning och publicering använder ditt senast sparade utkast.':'Spara ett första utkast för att förhandsgranska uppgifterna.'}</p>
    <p class="hint">${publicLink}</p>
    ${draft ? `<div class="actions"><a class="button outline" href="${base}/preview/sidan">Förhandsgranska utkast</a>
    <form id="page-publish-form" method="post" action="${action}">${field('intent','publish')}${currentVersion}
    <button class="button" type="submit"${upToDate?' disabled':''}>Publicera utkast</button></form></div>` : ''}</section>
    ${options.length ? `<details class="history"><summary>Versionshistorik och återställning</summary>
    <p class="hint">Den valda versionen visas direkt i bilhallen. Avpublicerar du uppgifterna behåller du utkastet.</p>
    <form id="page-restore-form" method="post" action="${action}">${field('intent','restore')}${currentVersion}
    <label for="page-restore-version">Version eller åtgärd</label><div class="actions"><select name="revision" id="page-restore-version" required>
    <option value="" selected disabled>Välj en version eller åtgärd</option>${options.join('')}</select>
    <button class="button outline" type="submit">Återställ version</button></div></form></details>` : ''}
    </section></div></main>`
  return framed('Sidan · '+brand,brand,base,'KUNDADMIN',adminNavigation(base,'site'),main,adminStyles)
}
