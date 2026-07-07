/**
 * lib/atlas/context/readers/view.ts — ③ View reader (CL Commit 2)
 *
 * Canonical §6.5 dim ③: "NormalizedView (reused verbatim) — the lens; ⑤ is
 * framed *through* it." Mapping §1.1: wrap `normalizeView`/`renderViewBlock`
 * — and "May NOT re-resolve view differently."
 *
 * This reader adds NOTHING to view handling. The untrusted client envelope
 * travels inside the `ContextRequest` (`req.view`, per §6.3); normalization
 * — route re-resolution, filter whitelisting, ref clamping — happens in
 * `normalizeView`, and rendering in `renderViewBlock`, both reused verbatim
 * from `lib/atlas/view-context.ts`. The `ATLAS_VIEW_AWARENESS` flag gate is
 * preserved exactly as the live path applies it today (off → no block).
 *
 * Boundaries held: pure/bounded (clamps are `normalizeView`'s own); no DB,
 * no ranking, no tool/model call. Project isolation is inherent — the view
 * carries only ids + short labels the client already sees, and project
 * resolution stays server-side in `normalizeView`. Never throws.
 */

import {
  isViewAwarenessEnabled,
  normalizeView,
  renderViewBlock,
} from '@/lib/atlas/view-context'
import type { ContextRequest } from '@/lib/atlas/context/request'
import type { ContextBlock, ReaderEnv } from './index'

/** ③ View — `ContextRequest → block | null`. Never throws. */
export async function readView(req: ContextRequest, _env: ReaderEnv): Promise<ContextBlock | null> {
  try {
    if (!isViewAwarenessEnabled()) return null
    const nv = normalizeView(req.view)
    if (!nv) return null
    return {
      dimension: 'view',
      channel: 'soft',
      text: renderViewBlock(nv),
      // The normalized (trusted) view rides along for the ⑤ reader's framing
      // (Stage 2) — framed THROUGH the view, never re-resolved from the raw
      // envelope (canonical §6.5).
      meta: { normalizedView: nv },
    }
  } catch {
    return null
  }
}
