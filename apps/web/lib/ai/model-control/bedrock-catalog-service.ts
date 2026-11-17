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
      // Only disclose a reviewed reason code, NEVER AWS source values,
      // account details, credentials, raw model IDs or stack traces.
      const categories: Readonly<Record<string, string>> = {
        BEDROCK_CATALOG_BAD_MODEL_ID: 'invalid_model_identifier',
        BEDROCK_CATALOG_BAD_PROFILE_ID: 'invalid_profile_identifier',
        BEDROCK_CATALOG_BAD_DESTINATION_ARN: 'invalid_profile_destination',
        BEDROCK_CATALOG_DUPLICATE_MODEL: 'duplicate_model_identifier',
        BEDROCK_CATALOG_DUPLICATE_PROFILE: 'duplicate_profile_identifier',
        BEDROCK_CATALOG_SIZE_INVALID: 'catalog_size_limit',
        BEDROCK_CATALOG_TOO_MANY_PROFILES: 'profile_size_limit',
        BEDROCK_CATALOG_INVALID_PROFILE_RESPONSE: 'missing_profile_list',
        BEDROCK_CATALOG_INVALID_PAGE_TOKEN: 'invalid_pagination',
        BEDROCK_CATALOG_PROFILE_PAGINATION_INCOMPLETE: 'pagination_incomplete',
      }
      const category = categories[error.message] ?? 'unknown_validation_error'
      throw new Error('CATALOG_RESPONSE_INCOMPLETE:' + category)
    }
    throw new Error('CATALOG_API_UNAVAILABLE')
  } finally {
    client.destroy()
  }
}
