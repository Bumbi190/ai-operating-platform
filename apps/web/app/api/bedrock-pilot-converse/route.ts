/**
 * Manually triggered, tiny Nova Micro inference test.
 * Only for the isolated Vercel Preview pilot branch, never production.
 * No existing long-lived AWS credentials; temporary STS credentials only.
 */
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
import { classifyBedrockAccessDenial } from './diagnostics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 18

const PILOT_BRANCH = 'feat/omnira-bedrock-pilot-20261116'
const PILOT_ROLE = 'arn:aws:iam::793854110735:role/Omnira-Bedrock-Test'
const PILOT_REGION = 'us-east-1'
const MODEL_ID = 'amazon.nova-micro-v1:0'
const PROMPT = 'Svara med exakt ett ord på svenska: Hej.'
const OUTPUT_LIMIT = 48
const STS_ENDPOINT = 'https://sts.us-east-1.amazonaws.com/'

function json(status: number, value: Record<string, unknown>): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function findXmlValue(xml: string, tag: string): string | null {
  const safe = tag.replace(/[^a-zA-Z]/g, '')
  const match = xml.match(new RegExp('<' + safe + '>([^<]+)</' + safe + '>'))
  return match?.[1] ?? null
}

export async function POST(request: Request): Promise<Response> {
  if (
    process.env.VERCEL_ENV !== 'preview' ||
    process.env.VERCEL_GIT_COMMIT_REF !== PILOT_BRANCH
  ) {
    return json(404, { status: 'unavailable' })
  }

  if (
    process.env.AWS_BEDROCK_ROLE_ARN !== PILOT_ROLE ||
    process.env.AWS_BEDROCK_REGION !== PILOT_REGION
  ) {
    return json(503, { status: 'configuration_not_ready' })
  }

  // Obtained from Vercel, never supplied in the request body.
  const token = request.headers.get('x-vercel-oidc-token')
  if (!token) return json(401, { status: 'vercel_oidc_token_missing' })

  const form = new URLSearchParams({
    Action: 'AssumeRoleWithWebIdentity',
    Version: '2011-06-15',
    RoleArn: PILOT_ROLE,
    RoleSessionName: 'omnira-nova-micro-one-shot',
    WebIdentityToken: token,
    DurationSeconds: '900',
  })

  let stsXml: string
  try {
    const sts = await fetch(STS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    })
    if (!sts.ok) return json(502, { status: 'oidc_role_assumption_not_verified' })
    stsXml = await sts.text()
  } catch {
    return json(502, { status: 'oidc_preflight_unavailable' })
  }

  const accessKeyId = findXmlValue(stsXml, 'AccessKeyId')
  const secretAccessKey = findXmlValue(stsXml, 'SecretAccessKey')
  const sessionToken = findXmlValue(stsXml, 'SessionToken')
  if (!accessKeyId || !secretAccessKey || !sessionToken || !stsXml.includes('<AssumedRoleUser>')) {
    return json(502, { status: 'sts_credentials_not_verified' })
  }

  // Explicit temporary credentials prevent fallback to existing Remotion keys.
  const client = new BedrockRuntimeClient({
    region: PILOT_REGION,
    credentials: { accessKeyId, secretAccessKey, sessionToken },
    maxAttempts: 1,
  })

  try {
    const result = await client.send(new ConverseCommand({
      modelId: MODEL_ID,
      messages: [{ role: 'user', content: [{ text: PROMPT }] }],
      inferenceConfig: { maxTokens: OUTPUT_LIMIT, temperature: 0 },
    }), { abortSignal: AbortSignal.timeout(7000) })

    const answer = result.output?.message?.content?.find(item => typeof item.text === 'string')?.text ?? ''
    return json(200, {
      status: 'nova_micro_replied',
      modelId: MODEL_ID,
      answer: answer.slice(0, 180),
      inputTokens: result.usage?.inputTokens ?? null,
      outputTokens: result.usage?.outputTokens ?? null,
      maxOutputTokens: OUTPUT_LIMIT,
      pilotOnly: true,
    })
  } catch (error) {
    // Return only a known error class, never AWS response internals or credentials.
    const name = error instanceof Error ? error.name : ''
    const allowed = [
      'AccessDeniedException', 'ValidationException', 'ResourceNotFoundException',
      'ModelNotReadyException', 'ThrottlingException', 'ServiceQuotaExceededException',
    ]
    return json(502, {
      status: 'bedrock_inference_not_verified',
      reason: allowed.includes(name) ? name : 'unknown_error',
      diagnostic: name === 'AccessDeniedException' ? classifyBedrockAccessDenial(error) : 'not_applicable',
    })
  } finally {
    client.destroy()
  }
}
