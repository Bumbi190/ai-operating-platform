/**
 * Isolated Vercel-OIDC -> AWS STS exchange for a single known test role.
 * No fallback to the AWS SDK default credential chain.
 * Does not call Bedrock and never logs credentials or raw STS XML.
 */
export const BEDROCK_PILOT_ROLE = 'arn:aws:iam::793854110735:role/Omnira-Bedrock-Test'
const STS_ENDPOINT = 'https://sts.us-east-1.amazonaws.com/'

export type ShortLivedAwsCredentials = Readonly<{
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
}>

function xmlValue(body: string, tag: string): string | null {
  const match = body.match(new RegExp('<' + tag + '>([^<>]+)</' + tag + '>'))
  return match?.[1] ?? null
}

export async function obtainPreviewCredentials(input: {
  oidcToken: string
  configuredRoleArn: string | undefined
  configuredRegion: string | undefined
  fetcher?: typeof fetch
}): Promise<ShortLivedAwsCredentials> {
  if (input.configuredRoleArn !== BEDROCK_PILOT_ROLE || input.configuredRegion !== 'us-east-1') {
    throw new Error('BEDROCK_PILOT_CONFIGURATION_REFUSED')
  }
  if (typeof input.oidcToken !== 'string' || !input.oidcToken.trim() ||
      input.oidcToken.length > 32000) {
    throw new Error('BEDROCK_PILOT_OIDC_TOKEN_MISSING')
  }
  const body = new URLSearchParams({
    Action: 'AssumeRoleWithWebIdentity', Version: '2011-06-15',
    RoleArn: BEDROCK_PILOT_ROLE,
    RoleSessionName: 'omnira-governed-editorial-preview',
    WebIdentityToken: input.oidcToken,
    DurationSeconds: '900',
  })
  let response: Response
  try {
    response = await (input.fetcher ?? fetch)(STS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(6500),
      cache: 'no-store',
    })
  } catch {
    throw new Error('BEDROCK_PILOT_STS_UNAVAILABLE')
  }
  if (!response.ok) throw new Error('BEDROCK_PILOT_STS_REFUSED')
  let xml: string
  try { xml = await response.text() } catch { throw new Error('BEDROCK_PILOT_STS_UNREADABLE') }
  if (!xml.includes('<AssumedRoleUser>')) throw new Error('BEDROCK_PILOT_STS_RESPONSE_INVALID')
  const accessKeyId = xmlValue(xml, 'AccessKeyId')
  const secretAccessKey = xmlValue(xml, 'SecretAccessKey')
  const sessionToken = xmlValue(xml, 'SessionToken')
  if (!accessKeyId || !secretAccessKey || !sessionToken) {
    throw new Error('BEDROCK_PILOT_STS_CREDENTIALS_MISSING')
  }
  return { accessKeyId, secretAccessKey, sessionToken }
}
