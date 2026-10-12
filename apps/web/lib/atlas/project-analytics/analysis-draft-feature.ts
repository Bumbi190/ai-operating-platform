import 'server-only'
export function analysisDraftsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ATLAS_ANALYSIS_DRAFTS_ENABLED === 'true'
}
