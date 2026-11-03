import {describe, expect, it} from 'vitest'
import {adminView, loginView, showroomView, siteAdminView, type AdminVehicle, type SiteContent, type SiteWorkspace, type VehicleContent} from './views'

const slug = 'lindas-testhall'
const brand = 'Lindås & co'
const photo = 'e'.repeat(64)
const content: VehicleContent = {name:'Linje S',price:249000,year:2024,mileage:3850,fuel:'El',sold:false,photos:[photo]}
const listing: AdminVehicle = {
  id:'19debf7e-7639-4f62-abdc-704e97511940',version:5,draft:{...content,sold:true},published:content,
  publishedRevision:4,history:[{revision:4,available:true},{revision:2,available:true}],
}

describe('customer showroom and separate editing surface', () => {
  it('keeps same-origin form submissions compatible with the server origin check', () => {
    for(const html of [loginView(slug), adminView({slug,brand,vehicles:[listing]},listing.id)]){
      expect(html).not.toContain('<meta name="referrer"')
    }
  })
  it('uses only the published car and its own photos in the public hall', () => {
    const html = showroomView({slug,brand,vehicles:[{id:listing.id,content}]})
    expect(html).toContain('Lindås &amp; co')
    expect(html).toContain('Linje S')
    expect(html).toContain('/hall/'+slug+'/foto/'+photo)
    expect(html).not.toMatch(/utkast=1|Nord GT|Nord R|Demo Motors|<script|id="vehicle-form"/)
    expect(html).toContain('data-sold="false"')
    expect(showroomView({slug,brand,vehicles:[]})).toContain('Inga publicerade bilar')
  })
  it('marks draft previews and uses the private image route for every draft photo', () => {
    const html = showroomView({slug,brand,vehicles:[{id:listing.id,content:listing.draft}]},true)
    expect(html).toContain('data-preview-banner')
    expect(html).toContain('/foto/'+photo+'?utkast=1')
    expect(html).toContain('data-sold="true"')
    expect(html).toContain('/admin?bil='+listing.id)
  })
  it('takes the merchant back to the exact selected non-first draft without reordering the hall', () => {
    const neighbor={id:'55cbed27-723b-4da4-aa28-22e58881565c',content:{...content,name:'Fjord L'}}
    const catalog={slug,brand,vehicles:[neighbor,{id:listing.id,content:listing.draft}]}
    const html=showroomView(catalog,true,listing.id)
    expect(html).toContain('/admin?bil='+listing.id)
    expect(html.indexOf('data-vehicle-id="'+neighbor.id+'"')).toBeLessThan(html.indexOf('data-vehicle-id="'+listing.id+'"'))
  })
  it('renders customer-controlled text as text and enforces photo identifiers', () => {
    const spike = '"><script>alert(1)</script>'
    const html = showroomView({slug,brand:spike,vehicles:[{id:listing.id,content:{...content,name:spike,photos:['../annat',photo]}}]})
    expect(html).not.toContain('<script')
    expect(html).not.toContain('/foto/../')
    expect(html).toContain('&lt;script&gt;')
    expect(loginView(slug,spike)).not.toContain('<script')
    expect(adminView({slug,brand:spike,vehicles:[]},undefined,spike)).not.toContain('<script')
  })
  it('ties save, publish and restore to the selected vehicle and version; treats a new record as a draft', () => {
    const workspace={slug,brand,vehicles:[listing]}
    const html=adminView(workspace,listing.id)
    expect(html).toContain('enctype="multipart/form-data"')
    for(const field of ['name','price','year','mileage','fuel','sold','photos','keepPhoto'])expect(html).toContain('name="'+field+'"')
    expect(html).toContain('name="version" value="5"')
    expect(html).toContain('name="vehicleId" value="'+listing.id+'"')
    expect(html).toContain('value="2"')
    expect(html).toContain('Förhandsgranska utkast')
    expect(html).toContain('Publicera utkast')
    expect(html).toContain('Återställ version')
    const blank=adminView(workspace,'ny')
    expect(blank).toContain('name="version" value="0"')
    expect(blank).not.toContain('id="publish-form"')
    expect(blank).not.toContain('id="restore-form"')
    expect(blank.match(/name="vehicleId" value="([^"]+)"/)?.[1]).toMatch(/^[0-9a-f-]{36}$/)
  })
})

const info: SiteContent = {
  heading:'Besök Lindås',description:'Välkommen till vår hall.',hours:'Mån–fre 10–18\nLör 11–15',
  phone:'+46 (0)31-12 34 56',email:'bil+hall@example.test',address:'Bilvägen 1\nLindås',
}
const site: SiteWorkspace = {
  slug,brand,version:7,draft:info,published:{...info,heading:'Hallen vid torget'},publishedRevision:5,
  history:[{revision:5},{revision:3,available:false},{revision:2,available:true}],
}

describe('dealer page information', () => {
  it('links each editor to the other within the same hall and exposes only the active page', () => {
    const inventory=adminView({slug,brand,vehicles:[listing]},listing.id)
    const page=siteAdminView(site)
    const other=siteAdminView({...site,slug:'annan-bilhall',brand:'Annans lager'})
    expect(inventory).toContain('href="/hall/'+slug+'/admin" aria-current="page">Bilannonser</a>')
    expect(inventory).toContain('href="/hall/'+slug+'/admin/sidan">Sidan</a>')
    expect(page).toContain('href="/hall/'+slug+'/admin">Bilannonser</a>')
    expect(page).toContain('href="/hall/'+slug+'/admin/sidan" aria-current="page">Sidan</a>')
    expect(page).not.toContain('<meta name="referrer"')
    expect(other).not.toContain('/hall/'+slug)
    expect(other).toContain('action="/hall/annan-bilhall/admin/sidan"')
    expect(() => siteAdminView({...site,slug:'../annan'})).toThrow('INVALID_DEALER_SLUG')
  })
  it('separates first-time, saved, published and withdrawn page states', () => {
    const first=siteAdminView({...site,version:0,draft:null,published:null,publishedRevision:null,history:[]})
    expect(first).toContain('id="page-form"')
    expect(first).toContain('name="version" value="0"')
    expect(first).not.toMatch(/id="page-publish-form"|id="page-restore-form"|href="[^"]*\/preview\/sidan"|href="[^"]*#om-hallen"/)
    const saved=siteAdminView({...site,published:null,publishedRevision:null,history:[]})
    expect(saved).toContain('/preview/sidan')
    expect(saved).toContain('id="page-publish-form"')
    expect(saved).not.toMatch(/id="page-restore-form"|disabled>Publicera utkast/)
    const edited=siteAdminView(site)
    for (const [id,intent] of [['page-form','save'],['page-publish-form','publish'],['page-restore-form','restore']]) {
      const form=edited.split('id="'+id+'"')[1].split('</form>')[0]
      expect(form).toContain('method="post" action="/hall/'+slug+'/admin/sidan"')
      expect(form).toContain('name="intent" value="'+intent+'"')
      expect(form).toContain('name="version" value="7"')
    }
    expect(edited).toContain('id="page-restore-version"')
    expect(edited).toContain('href="/hall/'+slug+'#om-hallen"')
    expect(edited).toContain('<option value="3">Version 3 · avpublicerad</option>')
    expect(edited).toContain('<option value="0">')
    expect(edited).not.toContain('<option value="5">')
    expect(siteAdminView({...site,published:{...info}})).toMatch(/disabled>Publicera utkast/)
    const withdrawn=siteAdminView({...site,published:null,publishedRevision:3})
    expect(withdrawn).toContain('<option value="5">')
    expect(withdrawn).not.toContain('<option value="0">')
  })
  it('preserves multiline input, enforces field limits and escapes drafts and feedback', () => {
    const spike='"><script>alert(1)</script></textarea>'
    const html=siteAdminView({...site,brand:spike,draft:{...info,heading:spike,description:spike}},spike)
    const form=html.split('id="page-form"')[1].split('</form>')[0]
    for (const [name,limit] of [['heading',80],['description',1000],['hours',400],['phone',40],['email',254],['address',180]]) {
      expect(form).toMatch(new RegExp('<(?:input|textarea) [^>]*name="'+name+'"[^>]*maxlength="'+limit+'"'))
    }
    expect(form).toMatch(/name="heading"[^>]*required/)
    expect(form).toMatch(/<textarea [^>]*name="hours"[^>]*>Mån–fre 10–18\nLör 11–15<\/textarea>/)
    expect(form).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script')
    expect(html).toContain('role="status"')
  })
  it('shows only supplied public details, keeps line breaks and limits contact links to safe phone and email destinations', () => {
    const catalog={slug,brand,vehicles:[]}
    const hidden=showroomView(catalog)
    expect(hidden).not.toMatch(/id="om-hallen"|href="#om-hallen"|href="tel:|href="mailto:/)
    const html=showroomView({...catalog,siteContent:info})
    expect(html).toContain('href="#om-hallen"')
    expect(html).toContain('id="om-hallen"')
    expect(html).toContain(info.hours)
    expect(html).toContain(info.address)
    expect(html).toContain('href="tel:+4631123456"')
    for (const [phone,href] of [['0046 (0)31-12 34 56','+4631123456'],['031-12 34 56','031123456'],['+39 (0)6 123456','+3906123456']]) {
      expect(showroomView({...catalog,siteContent:{...info,phone}})).toContain('href="tel:'+href+'"')
    }
    expect(html).toMatch(/href="mailto:bil(?:%2B|\+)hall@example\.test"/)
    const hostile=showroomView({...catalog,siteContent:{...info,heading:'<svg/onload=x>',description:'<script>bad</script>',email:'a@b.se?bcc=a@b.se',phone:'0300\nTel:9',hours:'',address:''}})
    expect(hostile).toContain('&lt;svg/onload=x&gt;')
    expect(hostile).toContain('&lt;script&gt;')
    expect(hostile).not.toMatch(/href="tel:|href="mailto:|<svg\/onload|<script>/)
    expect(hostile).not.toContain('>Öppettider<')
    for (const email of ['andra@exempel.se%0Abcc=anna', 'a@b.se\r\nBcc: c@d.se']) {
      expect(showroomView({...catalog,siteContent:{...info,email}})).not.toContain('href="mailto:')
    }
  })
  it('previews page edits without changing the published first car, gallery URLs or order', () => {
    const neighbor={id:'55cbed27-723b-4da4-aa28-22e58881565c',content:{...content,name:'Fjord L'}}
    const cars=[neighbor,{id:listing.id,content}]
    const page=showroomView({slug,brand,vehicles:cars,siteContent:info},true,undefined,true)
    expect(page).toContain('data-preview-banner')
    expect(page).toContain('href="/hall/'+slug+'/admin/sidan"')
    expect(page).toContain('/foto/'+photo)
    expect(page).not.toMatch(/utkast=1|\/admin\?bil=/)
    expect(page).toContain('<h1 id="dh-title">Fjord L</h1>')
    expect(page.indexOf('data-vehicle-id="'+neighbor.id+'"')).toBeLessThan(page.indexOf('data-vehicle-id="'+listing.id+'"'))
    expect(page).toContain(info.heading)
    const vehicle=showroomView({slug,brand,vehicles:cars,siteContent:site.published},true,listing.id)
    expect(vehicle).toContain(site.published!.heading)
    expect(vehicle).not.toContain(info.heading)
    expect(vehicle).toContain('/foto/'+photo+'?utkast=1')
    expect(vehicle).toContain('/admin?bil='+listing.id)
  })
})
