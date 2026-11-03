import {cinematicAssetNames, cinematicAssetResponse, isListingViewerAsset} from '@/lib/website-build/studio/cinematic-assets'
import {createCinematicDemoHtml} from '@/lib/website-build/studio/cinematic-demo'
import {listingViewerResponse} from '@/lib/website-build/studio/cinematic-listing'
import {reelResponse} from '@/lib/website-build/studio/cinematic-reel'
import {demoMotorsReadOnlyHtml} from '@/lib/website-build/studio/demo-motors-readonly'
import {readPublicWebsitePreviewAsset} from '@/lib/website-build/public-preview-assets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const showroom = '/bilhandlare/bilhall'
const mediaRoot = showroom + '/assets/'

/** Public pilot edition. All documents and files come from the bundled fictional
 * showroom. The request cannot select a project, a disk path or a customer asset. */
export async function GET(request: Request, {params}: {params: {path?: string[]}}): Promise<Response> {
  const path = params.path ?? []
  if (!path.length) return reelResponse(cinematicAssetNames().reelRuntime, showroom)
  if (path.length === 1 && path[0] === 'bilhall') {
    const view = new URL(request.url).searchParams.get('view')
    if (view === 'nord-r') return listingViewerResponse(mediaRoot)
    if (view === 'visning') return reelResponse(cinematicAssetNames().reelRuntime, showroom)
    if (view === null) {
      return new Response(createCinematicDemoHtml(demoMotorsReadOnlyHtml(), mediaRoot), {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'public, max-age=0, must-revalidate',
          'content-security-policy': "frame-ancestors 'none'",
          'referrer-policy': 'no-referrer',
          'x-content-type-options': 'nosniff',
          'x-frame-options': 'DENY',
        },
      })
    }
  }

  if (path.length === 3) {
    const [group, directory, name] = path
    let response: Response | undefined
    if ((group === 'bilhall' && directory === 'assets') ||
        (group === 'assets' && isListingViewerAsset([directory, name]))) {
      response = cinematicAssetResponse(request, name)
    } else if (group === 'assets' && (directory === 'runtime' || directory === '3d')) {
      const asset = readPublicWebsitePreviewAsset([directory, name])
      if (asset) response = new Response(Buffer.from(asset.bytes), {headers: {
        'content-type': asset.contentType,
        'content-length': String(asset.bytes.byteLength),
        'x-content-type-options': 'nosniff',
      }})
    }
    if (response) {
      if (response.ok) response.headers.set('cache-control', 'public, max-age=31536000, immutable')
      return response
    }
  }
  return new Response(null, {status: 404, headers: {'cache-control': 'no-store'}})
}
