// Exact-size CDP capture; Playwright's viewport-only clipping can silently
// produce a shorter PNG than the claimed evidence dimensions.
export async function captureDocumentRegion(page,context,width,height){
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>2000||height>6000)throw Error('INVALID_SCREENSHOT_REGION')
  const cdp=await context.newCDPSession(page)
  let screenshot
  try {
    screenshot=await cdp.send('Page.captureScreenshot',{
      format:'png',fromSurface:true,captureBeyondViewport:true,
      clip:{x:0,y:0,width,height,scale:1}
    })
  } finally {await cdp.detach()}
  const bytes=Buffer.from(screenshot.data,'base64')
  if(bytes.length<24||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)!==width||bytes.readUInt32BE(20)!==height)
    throw Error('SCREENSHOT_DIMENSIONS_INCOMPLETE')
  return bytes
}
