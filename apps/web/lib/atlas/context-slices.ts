/**
 * Launch independent Atlas context reads together, but return them in the
 * canonical prompt order. Each source fails closed to its own fallback.
 */
export interface AtlasContextSliceReaders {
  live(): Promise<string>
  tool(): Promise<string>
  action(): Promise<{ text: string; hasRecentDelegation: boolean }>
  records(): Promise<string>
}

export interface AtlasContextSlices {
  live: string
  tool: string
  action: string
  records: string
  hasRecentDelegation: boolean
}

export async function readAtlasContextSlices(
  readers: AtlasContextSliceReaders,
): Promise<AtlasContextSlices> {
  const [live, tool, action, records] = await Promise.allSettled([
    readers.live(),
    readers.tool(),
    readers.action(),
    readers.records(),
  ])

  return {
    live: live.status === 'fulfilled' ? live.value : '',
    tool: tool.status === 'fulfilled' ? tool.value : '',
    action: action.status === 'fulfilled' ? action.value.text : '',
    records: records.status === 'fulfilled' ? records.value : '',
    hasRecentDelegation: action.status === 'fulfilled'
      ? action.value.hasRecentDelegation
      : false,
  }
}
