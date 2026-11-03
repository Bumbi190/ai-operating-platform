/** Only the four reviewed, bundled illustrations may appear in a fictional Studio plan. */
export const DEALER_SHOWROOM_STARTER = 'premium-dealer-showroom-v2'
const photoNames = ['concept-green','concept-silver','concept-blue','concept-black'] as const
const vehicleLimits = {nameLength:80, minYear:1886, maxYear:2100, maxPrice:99999999, maxMileage:9999999} as const
const vehicleName = /^[^\u0000-\u001f\u007f-\u009f]*$/u
const fuels = ['El','Hybrid','Bensin','Diesel'] as const

export type DemoVehicle = {
  name: string
  price: number
  year: number
  mileage: number
  fuel: typeof fuels[number]
  photo: typeof photoNames[number]
  sold?: boolean
}
export type ShowroomOptions = {vehicles: DemoVehicle[]}

export const SHOWROOM_OPTIONS_SCHEMA = {
  type:'object', additionalProperties:false, required:['vehicles'],
  properties:{vehicles:{type:'array',minItems:1,maxItems:photoNames.length,
    description:'Fictional examples in display order, featured first. Use mileage in Swedish mil and price in SEK. Each illustration may represent one example car.',
    items:{type:'object',additionalProperties:false,required:['name','price','year','mileage','fuel','photo'],properties:{
      name:{type:'string',minLength:1,maxLength:vehicleLimits.nameLength,pattern:vehicleName.source}, price:{type:'integer',minimum:0,maximum:vehicleLimits.maxPrice},
      year:{type:'integer',minimum:vehicleLimits.minYear,maximum:vehicleLimits.maxYear}, mileage:{type:'integer',minimum:0,maximum:vehicleLimits.maxMileage},
      fuel:{type:'string',enum:fuels}, photo:{type:'string',enum:photoNames}, sold:{type:'boolean'},
    }},
  }},
}

function fields(value:unknown, required:string[], optional:string[]=[]):Record<string,unknown>{
  if(!value || typeof value!=='object' || Array.isArray(value)) throw Error('INVALID_SHOWROOM')
  const record=value as Record<string,unknown>
  if(required.some(k=>!Object.hasOwn(record,k)) || Object.keys(record).some(k=>!required.includes(k)&&!optional.includes(k))) throw Error('INVALID_SHOWROOM')
  return record
}

function integer(value:unknown, minimum:number, maximum:number):number{
  if(typeof value!=='number' || !Number.isSafeInteger(value) || value<minimum || value>maximum) throw Error('INVALID_SHOWROOM')
  return value
}

export function parseShowroomOptions(value:unknown):ShowroomOptions {
  const {vehicles}=fields(value,['vehicles'])
  if(!Array.isArray(vehicles) || !vehicles.length || vehicles.length>photoNames.length) throw Error('INVALID_SHOWROOM')
  const assigned=new Set<string>()
  return {vehicles:vehicles.map(input=>{
    const row=fields(input,['name','price','year','mileage','fuel','photo'],['sold'])
    const name=typeof row.name==='string' && vehicleName.test(row.name)?row.name.trim():''
    const photo=photoNames.find(p=>p===row.photo), fuel=fuels.find(f=>f===row.fuel)
    if(!name || name.length>vehicleLimits.nameLength || !photo || assigned.has(photo) || !fuel) throw Error('INVALID_SHOWROOM')
    if(Object.hasOwn(row,'sold') && typeof row.sold!=='boolean') throw Error('INVALID_SHOWROOM')
    assigned.add(photo)
    return {name,price:integer(row.price,0,vehicleLimits.maxPrice),year:integer(row.year,vehicleLimits.minYear,vehicleLimits.maxYear),
      mileage:integer(row.mileage,0,vehicleLimits.maxMileage),fuel,photo,...(typeof row.sold==='boolean'?{sold:row.sold}:{})}
  })}
}
