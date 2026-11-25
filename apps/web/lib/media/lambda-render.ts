/**
 * lambda-render.ts — Remotion Lambda cloud rendering service.
 *
 * Thin wrapper around @remotion/lambda/client.
 * Handles: start render, poll progress, extract output URL.
 *
 * Required env vars:
 *   REMOTION_AWS_ACCESS_KEY_ID       (production credentials, isolated from Bedrock)
 *   REMOTION_AWS_SECRET_ACCESS_KEY
 *   REMOTION_AWS_REGION              (falls back to AWS_REGION for legacy environments)
 *   REMOTION_LAMBDA_FUNCTION_NAME    (set after: npx remotion lambda functions deploy)
 *   REMOTION_SERVE_URL_PRODUCTION    (preferred in production; falls back to REMOTION_SERVE_URL)
 *   REMOTION_SERVE_URL               (legacy and preview site URL)
 */

import type { VideoInputProps } from './video-props'

// Lazy-load @remotion/lambda/client to avoid import errors if not installed
async function getLambdaClient() {
  try {
    return await import('@remotion/lambda/client')
  } catch {
    throw new Error(
      '@remotion/lambda is not installed. Run: npm install @remotion/lambda --save ' +
      'inside apps/web/',
    )
  }
}

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

function remotionRegion(): string {
  return process.env.REMOTION_AWS_REGION?.trim() || requireEnv('AWS_REGION')
}

function remotionServeUrl(): string {
  return process.env.REMOTION_SERVE_URL_PRODUCTION?.trim() || requireEnv('REMOTION_SERVE_URL')
}

// ─── Start a Lambda render ────────────────────────────────────────────────────

export async function startLambdaRender(
  scriptId: string,
  inputProps: VideoInputProps,
  composition: 'ShortFormVideo' | 'SimpleNewsReel' = 'SimpleNewsReel',
): Promise<{ renderId: string; bucketName: string }> {
  const { renderMediaOnLambda } = await getLambdaClient()

  const region     = remotionRegion()
  const fnName     = requireEnv('REMOTION_LAMBDA_FUNCTION_NAME')
  const serveUrl   = remotionServeUrl()

  const result = await renderMediaOnLambda({
    region:          region as Parameters<typeof renderMediaOnLambda>[0]['region'],
    functionName:    fnName,
    serveUrl,
    composition,
    inputProps:      { ...inputProps },
    codec:           'h264',
    imageFormat:     'jpeg',
    jpegQuality:     90,
    maxRetries:      3,
    framesPerLambda: 300,  // 5 chunks for a 60s video — stays under 10 concurrency limit, fits in 900s timeout
    privacy:         'public',       // output MP4 is publicly readable on S3
    outName:         `${scriptId}.mp4`,
    logLevel:        'warn',
  })

  return { renderId: result.renderId, bucketName: result.bucketName }
}

// ─── Poll render progress ─────────────────────────────────────────────────────

export interface RenderProgress {
  progress: number    // 0–1
  done: boolean
  videoUrl?: string   // S3 public URL, only when done
  error?: string
}

export async function getLambdaRenderProgress(
  renderId: string,
  bucketName: string,
): Promise<RenderProgress> {
  const { getRenderProgress } = await getLambdaClient()

  const region = remotionRegion()
  const fnName = requireEnv('REMOTION_LAMBDA_FUNCTION_NAME')

  const prog = await getRenderProgress({
    renderId,
    bucketName,
    functionName: fnName,
    region: region as Parameters<typeof getRenderProgress>[0]['region'],
  })

  if (prog.fatalErrorEncountered) {
    return {
      progress: 0,
      done: true,
      error: prog.errors?.[0]?.message ?? 'Unknown Lambda render error',
    }
  }

  if (prog.done) {
    return {
      progress: 1,
      done: true,
      videoUrl: prog.outputFile ?? undefined,
    }
  }

  return {
    progress: prog.overallProgress ?? 0,
    done: false,
  }
}
