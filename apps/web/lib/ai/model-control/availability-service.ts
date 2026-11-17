/**
 * Dedicated non-inferencing, operator-triggered AWS Bedrock read.
 * Exactly two control-plane calls: list the model IDs in the source Region,
 * then inspect ONE listed foundation-model ID. No Runtime client or DB write.
 */
import 'server-only'
import {
  BedrockClient, ListFoundationModelsCommand,
  GetFoundationModelAvailabilityCommand,
} from '@aws-sdk/client-bedrock'
import type { CatalogCredentials } from './catalog-oidc'
import { CATALOG_MAX_FOUNDATIONS, CATALOG_REGION } from './discovery-normalize'
import {
  normalizeAvailabilityReview, validAvailabilityModelId,
  type AvailabilityReview,
} from './availability-review'

export async function readBedrockModelAvailability(
  creds: CatalogCredentials, modelId: string,
): Promise<AvailabilityReview> {
  if (!validAvailabilityModelId(modelId)) throw new Error('AVAILABILITY_MODEL_ID_INVALID')
  if (!creds.accessKeyId || !creds.secretAccessKey || !creds.sessionToken) {
    throw new Error('AVAILABILITY_CREDENTIALS_MISSING')
  }
  const client = new BedrockClient({
    region: CATALOG_REGION, credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
    }, maxAttempts: 1,
  })
  const signal = AbortSignal.timeout(12_000)
  try {
    const catalog = await client.send(new ListFoundationModelsCommand({}), {
      abortSignal: signal,
    })
    const list = catalog.modelSummaries
    if (!Array.isArray(list) || list.length > CATALOG_MAX_FOUNDATIONS) {
      throw new Error('AVAILABILITY_CATALOG_INVALID')
    }
    // Never accept an arbitrary client-provided ARN or a system inference profile.
    if (list.filter(m => m.modelId === modelId).length !== 1) {
      throw new Error('AVAILABILITY_MODEL_NOT_LISTED')
    }
    const response = await client.send(new GetFoundationModelAvailabilityCommand({
      modelId,
    }), { abortSignal: signal })
    return normalizeAvailabilityReview(modelId, response)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'AVAILABILITY_MODEL_NOT_LISTED') throw error
    if (message === 'AVAILABILITY_CATALOG_INVALID'
      || message === 'AVAILABILITY_RESPONSE_INVALID'
      || message === 'AVAILABILITY_RESPONSE_ID_MISSING'
      || message === 'AVAILABILITY_RESPONSE_ID_MISMATCH') throw error
    if (error instanceof Error && error.name === 'AccessDeniedException') {
      throw new Error('AVAILABILITY_IAM_DENIED')
    }
    throw new Error('AVAILABILITY_API_UNAVAILABLE')
  } finally {
    client.destroy()
  }
}
