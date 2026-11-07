import {randomBytes} from 'node:crypto'
import {describe,it,expect} from 'vitest'
import sharp from 'sharp'
import {inspectVehiclePhotoPixels} from './image-inspection'

async function photo(format:'png'|'jpg'|'webp'='png'){
 const pixels=randomBytes(640*512*3)
 const image=sharp(pixels,{raw:{width:640,height:512,channels:3}})
 if(format==='png')return image.png({compressionLevel:1}).toBuffer()
 if(format==='jpg')return image.jpeg({quality:90}).toBuffer()
 return image.webp({quality:90}).toBuffer()
}
describe('full vehicle original image decode, not physical-car verification',()=>{
 it.each(['png','jpg','webp'] as const)('accepts an actual %s photo only with matching codec, dimensions and complete pixels',async format=>{
  const data=await photo(format)
  expect(data.byteLength).toBeGreaterThan(20_000)
  expect(await inspectVehiclePhotoPixels(data,{format,width:640,height:512})).toMatchObject({
   status:'pixels_decoded',width:640,height:512
  })
 })
 it('rejects a different real codec even if metadata calls it PNG',async()=>{
  const data=await photo('jpg')
  expect(await inspectVehiclePhotoPixels(data,{format:'png',width:640,height:512}))
   .toMatchObject({status:'refused',reason:'PHOTO_CODEC_MISMATCH'})
 })
 it('rejects caller-declared dimensions that differ from actual decoded image',async()=>{
  const data=await photo('png')
  expect(await inspectVehiclePhotoPixels(data,{format:'png',width:512,height:640}))
   .toMatchObject({status:'refused',reason:'PHOTO_DIMENSIONS_MISMATCH'})
 })
 it('rejects a cropped/truncated payload after valid PNG header',async()=>{
  const data=await photo('png')
  expect(await inspectVehiclePhotoPixels(data.subarray(0,Math.floor(data.length/3)),{
   format:'png',width:640,height:512
  })).toMatchObject({status:'refused'})
 })
 it('rejects corrupt pixels despite a recognized PNG signature',async()=>{
  const data=await photo('png')
  const corrupted=Buffer.from(data);corrupted.fill(0xFF,3000,3500)
  expect((await inspectVehiclePhotoPixels(corrupted,{
   format:'png',width:640,height:512
  })).status).toBe('refused')
 })
 it('refuses EXIF rotation requiring canonical normalization before review',async()=>{
  const jpeg=await sharp(randomBytes(640*512*3),{raw:{width:640,height:512,channels:3}})
   .jpeg().withMetadata({orientation:6}).toBuffer()
  expect(await inspectVehiclePhotoPixels(jpeg,{format:'jpg',width:640,height:512}))
   .toMatchObject({status:'refused',reason:'ORIENTATION_REQUIRES_NORMALIZATION'})
 })
 it('refuses implausible header dimensions before decoding a tiny image',async()=>{
  const small=await sharp({create:{width:40,height:40,channels:3,background:'#e1e1e1'}}).png().toBuffer()
  expect(await inspectVehiclePhotoPixels(small,{format:'png',width:40,height:40}))
   .toMatchObject({status:'refused',reason:'PHOTO_DIMENSIONS_MISMATCH'})
 })
 it('refuses highly compressed pixel bombs above the 12-million-pixel budget',async()=>{
  const bomb=await sharp({create:{width:4000,height:4000,channels:3,background:'#222222'}}).png().toBuffer()
  expect(bomb.length).toBeLessThan(15_000_000)
  expect((await inspectVehiclePhotoPixels(bomb,{format:'png',width:4000,height:4000})).status).toBe('refused')
 })
 it('rejects multi-frame animated WebP instead of silently checking only frame 1',async()=>{
  const raw=randomBytes(640*512*2*3)
  const frame=sharp(raw,{raw:{width:640,height:1024,pageHeight:512,channels:3}})
  const animation=await frame.webp({delay:[150,150],loop:0}).toBuffer()
  const meta=await sharp(animation,{animated:true,pages:-1}).metadata()
  expect(meta.pages).toBe(2)
  expect(await inspectVehiclePhotoPixels(animation,{format:'webp',width:640,height:512}))
   .toMatchObject({status:'refused',reason:'MULTIFRAME_PHOTO_NOT_ALLOWED'})
 })
})
