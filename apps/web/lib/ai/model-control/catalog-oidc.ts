/**
 * One dedicated read-only role to discover AWS Bedrock catalog metadata.
 * Role doesn't exist yet. NEVER reuse the Preview InvokeModel role, and never
 * fall back to AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY used by Remotion.
 */
export const CATALOG_READ_ROLE = 'arn:aws:iam::793854110735:role/Omnira-Bedrock-Catalog-Preview'
const STS_URL = 'https://sts.us-east-1.amazonaws.com/'

function xmlValue(xml: string, tag: string): string | null {
  return xml.match(new RegExp('<' + tag + '>([^<>]+)</' + tag + '>'))?.[1] ?? null
}

export type CatalogCredentials = Readonly<{
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
}>

export async function getCatalogReadCredentials(input: {
  configuredRoleArn: string | undefined
  oidcToken: string | null
  fetcher?: typeof fetch
}): Promise<CatalogCredentials> {
  if (input.configuredRoleArn !== CATALOG_READ_ROLE) {
    throw new Error('CATALOG_READ_ROLE_NOT_CONFIGURED')
  }
  if (!input.oidcToken || input.oidcToken.length > 32000 || !input.oidcToken.trim()) {
    throw new Error('CATALOG_PREVIEW_OIDC_TOKEN_MISSING')
  }
  const request = new URLSearchParams({
    Action: 'AssumeRoleWithWebIdentity',
    Version: '2011-06-15',
    RoleArn: CATALOG_READ_ROLE,
    RoleSessionName: 'omnira-readonly-catalog-preview',
    WebIdentityToken: input.oidcToken,
    DurationSeconds: '900',
  })
  let response: Response
  try {
    response = await (input.fetcher ?? fetch)(STS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: request.toString(), cache: 'no-store',
      signal: AbortSignal.timeout(7000),
    })
  } catch {
    throw new Error('CATALOG_STS_UNAVAILABLE')
  }
  if (!response.ok) throw new Error('CATALOG_STS_DENIED')
  let xml: string
  try { xml = await response.text() } catch {
    throw new Error('CATALOG_STS_UNREADABLE')
  }
  if (!xml.includes('<AssumedRoleUser>')) throw new Error('CATALOG_STS_INVALID_RESPONSE')
  const accessKeyId = xmlValue(xml, 'AccessKeyId')
  const secretAccessKey = xmlValue(xml, 'SecretAccessKey')
  const sessionToken = xmlValue(xml, 'SessionToken')
  if (!accessKeyId || !secretAccessKey || !sessionToken) {
    throw new Error('CATALOG_STS_MISSING_CREDENTIALS')
  }
  return { accessKeyId, secretAccessKey, sessionToken }
}
