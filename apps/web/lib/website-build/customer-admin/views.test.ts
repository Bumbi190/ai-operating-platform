import {describe, expect, it} from 'vitest'
import {adminView, loginView, showroomView, type AdminVehicle, type VehicleContent} from './views'

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
