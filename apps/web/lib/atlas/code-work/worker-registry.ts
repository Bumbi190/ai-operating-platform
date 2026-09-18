/** SDF-1A worker identity registry. Identity is never authority. */

import {
  CODE_WORK_OUTPUT_PROTOCOL,
  CODE_WORK_WORKER_ADAPTER_ID,
  CODE_WORK_WORKER_ADAPTER_VERSION,
} from './types'

export const CLAUDE_PATCH_V1 = Object.freeze({
  adapterId: CODE_WORK_WORKER_ADAPTER_ID,
  adapterVersion: CODE_WORK_WORKER_ADAPTER_VERSION,
  provider: 'anthropic' as const,
  modelId: 'claude-sonnet-4-6' as const,
  outputProtocol: CODE_WORK_OUTPUT_PROTOCOL,
  capability: 'structured_file_operations_only' as const,
  toolAccess: 'none' as const,
  shellAccess: 'none' as const,
  gitAccess: 'none' as const,
  directFilesystemAccess: 'none' as const,
  workerNetworkAccess: 'none' as const,
})

export function lookupCodeWorkWorker(input: {
  adapterId: unknown
  adapterVersion: unknown
  provider: unknown
  modelId: unknown
  outputProtocol: unknown
}) {
  return input.adapterId === CLAUDE_PATCH_V1.adapterId
    && input.adapterVersion === CLAUDE_PATCH_V1.adapterVersion
    && input.provider === CLAUDE_PATCH_V1.provider
    && input.modelId === CLAUDE_PATCH_V1.modelId
    && input.outputProtocol === CLAUDE_PATCH_V1.outputProtocol
    ? CLAUDE_PATCH_V1
    : null
}
