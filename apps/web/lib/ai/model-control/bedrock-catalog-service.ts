/**
 * AWS Bedrock CONTROL-PLANE catalog discovery, never model inference.
 *
 * This is only callable from an authenticated Preview operator API after a
 * dedicated catalog-role OIDC exchange. No default AWS credential providers,
 * no InvokeModel, no DB writes, and no cached private credentials.
 */
import 'server-only'
import {
  BedrockClient,
  ListFoundationModelsCommand,
  ListInferenceProfilesCommand,
} from '@aws-sdk/client-bedrock'
import type { CatalogCredentials } from './catalog-oidc'
import {
  CATALOG_REGION, CATALOG_PROFILE_PAGE_SIZE,
  collectInferenceProfiles, normalizeBedrockCatalog,
  type CatalogSnapshot,
} from './discovery-normalize'

export async function readAwsBedrockCatalog(
  creds: CatalogCredentials,
): Promise<CatalogSnapshot> {
  if (!creds.accessKeyId || !creds.secretAccessKey || !creds.sessionToken) {
    throw new Error('CATALOG_EXPLICIT_CREDENTIALS_REQUIRED')
  }
  // A single total budget for this *non-inferencing* discovery attempt.
  const signal = AbortSignal.timeout(12_000)
  const client = new BedrockClient({
    region: CATALOG_REGION,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
    },
    maxAttempts: 1,
  })
  try {
    const foundation = await client.send(new ListFoundationModelsCommand({}), {
      abortSignal: signal,
    })
    if (!Array.isArray(foundation.modelSummaries)) {
      throw new Error('CATALOG_FOUNDATION_RESPONSE_INVALID')
    }
    // Profiles are paged independently; no pagination for ListFoundationModels.
    const profiles = await collectInferenceProfiles(async nextToken => {
      const page = await client.send(new ListInferenceProfilesCommand({
        maxResults: CATALOG_PROFILE_PAGE_SIZE,
        ...(nextToken ? { nextToken } : {}),
      }), { abortSignal: signal })
      return {
        inferenceProfileSummaries: page.inferenceProfileSummaries,
        nextToken: page.nextToken,
      }
    })
    return normalizeBedrockCatalog(foundation.modelSummaries, profiles)
  } catch (error) {
    if (error instanceof Error && error.name === 'AccessDeniedException') {
      throw new Error('CATALOG_IAM_READ_PERMISSION_MISSING')
    }
    if (error instanceof Error && error.message.startsWith('BEDROCK_CATALOG_')) {
      throw new Error('CATALOG_RESPONSE_INCOMPLETE')
    }
    throw new Error('CATALOG_API_UNAVAILABLE')
  } finally {
    client.destroy()
  }
}
