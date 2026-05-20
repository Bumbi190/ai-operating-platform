/**
 * GET /api/runs/[id]/stream — Server-Sent Events stream
 *
 * Polls run_logs every 800ms and pushes new entries to the browser.
 *
 * Decision: Simple polling over Supabase Realtime because:
 *   - No extra client-side setup needed
 *   - Good enough for <20 concurrent users
 *   - Easy to debug (just watch the DB)
 * Upgrade to Supabase Realtime subscriptions when latency becomes noticeable.
 *
 * Uses admin client so it works even if the user's session is stale during
 * a long-running stream. Auth is still checked on initial connect.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  // Auth check on connect
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const runId = params.id

  // Verify run belongs to user's project
  const { data: run } = await supabase
    .from('runs')
    .select('id, status, project_id')
    .eq('id', runId)
    .single()

  if (!run) return new Response('Run inte hittad', { status: 404 })

  // Use admin client for polling — no cookie dependency during streaming
  const admin = createAdminClient()

  let lastCreatedAt: string | null = null
  let polls = 0
  const MAX_POLLS = 180 // ~2.4 min at 800ms — enough for most runs

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()

      function send(data: object) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      // Initial heartbeat so browser knows connection is alive
      controller.enqueue(enc.encode(': connected\n\n'))

      // If run is already done on connect, send existing logs immediately
      if (run.status === 'done' || run.status === 'failed') {
        const { data: existingLogs } = await admin
          .from('run_logs')
          .select('*')
          .eq('run_id', runId)
          .order('created_at')

        for (const log of existingLogs ?? []) {
          send({ type: 'log', log })
        }
        send({ type: run.status === 'done' ? 'done' : 'error', status: run.status })
        controller.close()
        return
      }

      async function poll() {
        if (polls++ > MAX_POLLS) {
          send({ type: 'error', message: 'Stream timeout' })
          controller.close()
          return
        }

        try {
          // Fetch new logs since last seen (using created_at for ordering)
          let query = admin
            .from('run_logs')
            .select('*')
            .eq('run_id', runId)
            .order('created_at', { ascending: true })

          if (lastCreatedAt) {
            query = query.gt('created_at', lastCreatedAt)
          }

          const { data: logs, error: logsErr } = await query

          if (logsErr) {
            console.error('Stream poll error:', logsErr)
          } else if (logs && logs.length > 0) {
            for (const log of logs) {
              send({ type: 'log', log })
            }
            lastCreatedAt = logs[logs.length - 1].created_at
          }

          // Check current run status
          const { data: currentRun } = await admin
            .from('runs')
            .select('status')
            .eq('id', runId)
            .single()

          if (currentRun?.status === 'done') {
            send({ type: 'done', status: 'done' })
            controller.close()
            return
          }

          if (currentRun?.status === 'failed') {
            send({ type: 'error', status: 'failed' })
            controller.close()
            return
          }
        } catch (err) {
          console.error('Stream error:', err)
        }

        // Schedule next poll
        setTimeout(poll, 800)
      }

      poll()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering
    },
  })
}
