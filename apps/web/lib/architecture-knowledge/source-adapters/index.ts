import type { KnowledgeSource } from '../types'
import { executiveIntelligenceAdapter } from './executive-intelligence'
import { intelligenceFabricAdapter } from './intelligence-fabric'
import { intelligenceGraphAdapter } from './intelligence-graph'
import { mobileIntelligenceAdapter } from './mobile-intelligence'
import type { KnowledgeSourceAdapter } from './types'

const ADAPTERS: Record<KnowledgeSource['adapter'], KnowledgeSourceAdapter> = {
  'intelligence-fabric': intelligenceFabricAdapter,
  'mobile-intelligence': mobileIntelligenceAdapter,
  'intelligence-graph': intelligenceGraphAdapter,
  'executive-intelligence': executiveIntelligenceAdapter,
}

export function sourceAdapterFor(source: KnowledgeSource): KnowledgeSourceAdapter {
  const adapter = ADAPTERS[source.adapter]
  if (!adapter) throw new Error(`No source adapter registered for ${source.adapter}`)
  return adapter
}
