import sharp from 'sharp'

/**
 * Full decoder verification of a single original after SHA-256 and authenticated
 * private storage reads. This establishes IMAGE validity, NOT seller camera
 * provenance, visual agreement with the actual car, licensing or approval.
 */
export type ExpectedPhotoPixels={
 format:'jpg'|'png'|'webp'
 width:number
 height:number
}
export type PixelInspection=
 | {status:'pixels_decoded';width:number;height:number;format:'jpeg'|'png'|'webp'}
 | {status:'refused';reason:string}

const MAX_PIXELS=12_000_000
const MAX_BYTES=15_000_000
const MIN_SIDE=480
const MAX_SIDE=8192

export async function inspectVehiclePhotoPixels(
 input:Uint8Array,expected:ExpectedPhotoPixels
):Promise<PixelInspection>{
 if(!(input instanceof Uint8Array)||!input.byteLength||input.byteLength>MAX_BYTES)
  return {status:'refused',reason:'PIXEL_FILE_SIZE_INVALID'}
 if(!expected||!['jpg','png','webp'].includes(expected.format)||
   !Number.isSafeInteger(expected.width)||!Number.isSafeInteger(expected.height))
  return {status:'refused',reason:'PIXEL_EXPECTATION_INVALID'}

 const format=expected.format==='jpg'?'jpeg':expected.format
 try{
  const source=Buffer.from(input)
  const opts={limitInputPixels:MAX_PIXELS,limitInputChannels:4,
   failOn:'warning' as const,animated:false,pages:1,sequentialRead:true,
   unlimited:false,autoOrient:false}
  // Inspect ALL available frames in metadata first. A single-frame reader can
  // otherwise hide an animated WebP behind the default pages=1 setting.
  const metadata=await sharp(source,{...opts,animated:true,pages:-1}).metadata()
  if(metadata.format!==format)return {status:'refused',reason:'PHOTO_CODEC_MISMATCH'}
  if((metadata.pages!==undefined&&metadata.pages!==1)||
     (metadata.delay!==undefined&&metadata.delay.length>1))
   return {status:'refused',reason:'MULTIFRAME_PHOTO_NOT_ALLOWED'}
  if(!metadata.width||!metadata.height||
     metadata.width<MIN_SIDE||metadata.height<MIN_SIDE||
     metadata.width>MAX_SIDE||metadata.height>MAX_SIDE||
     metadata.width*metadata.height>MAX_PIXELS||
     metadata.width!==expected.width||metadata.height!==expected.height)
   return {status:'refused',reason:'PHOTO_DIMENSIONS_MISMATCH'}
  // Prevent a single uploaded file from hiding multiple frames/pages, and
  // avoid a silently rotated car whose unrotated dimensions were attested.
  if(metadata.orientation!==undefined&&metadata.orientation!==1)
   return {status:'refused',reason:'ORIENTATION_REQUIRES_NORMALIZATION'}

  // metadata() only reads the header. stats() FORCES a complete pixel decode,
  // so truncated or corrupted image payloads do not receive a review token.
  const statistics=await sharp(source,opts).stats()
  if(!statistics.channels.length||!statistics.channels.every(ch=>
   Number.isFinite(ch.mean)&&Number.isFinite(ch.stdev)))
   return {status:'refused',reason:'PHOTO_DECODE_INVALID'}
  return {status:'pixels_decoded',width:metadata.width,height:metadata.height,format}
 }catch{
  return {status:'refused',reason:'PHOTO_DECODE_FAILED'}
 }
}
