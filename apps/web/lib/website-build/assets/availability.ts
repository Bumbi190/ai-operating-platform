import 'server-only'
/** Off unless an operator explicitly enables the reviewed storage schema. */
export function referenceUploadEnabled(): boolean {
  return process.env.ATLAS_REFERENCE_UPLOAD_ENABLED === 'true'
}
