/** Plain style data only. Never accepts executable CSS, URLs, fonts or authority. */
export type WebsiteVisualStyle = {
  palette: {background: string; foreground: string; accent: string}
  font: 'serif' | 'sans'
}
const color = {type: 'string', pattern: '^#[0-9a-fA-F]{6}$'}
export const WEBSITE_VISUAL_STYLE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    palette: {type: 'object', additionalProperties: false,
      properties: {background: color, foreground: color, accent: color},
      required: ['background', 'foreground', 'accent']},
    font: {type: 'string', enum: ['serif', 'sans']},
  },
  required: ['palette', 'font'],
}
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('INVALID_VISUAL_STYLE')
  const result = value as Record<string, unknown>
  if (Object.keys(result).length !== keys.length || keys.some(key => !Object.hasOwn(result, key))) throw Error('INVALID_VISUAL_STYLE')
  return result
}
export function parseWebsiteVisualStyle(value: unknown): WebsiteVisualStyle {
  const visual = record(value, ['palette', 'font'])
  const palette = record(visual.palette, ['background', 'foreground', 'accent'])
  for (const color of Object.values(palette)) {
    if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) throw Error('INVALID_VISUAL_STYLE')
  }
  if (visual.font !== 'serif' && visual.font !== 'sans') throw Error('INVALID_VISUAL_STYLE')
  return {
    palette: {background: palette.background as string, foreground: palette.foreground as string, accent: palette.accent as string},
    font: visual.font,
  }
}
