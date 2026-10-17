/** Release the opening phrase early; keep later speech chunks long enough for flow. */
export function takeSpeechChunk(text: string, first: boolean, final: boolean): number {
  const limit = first ? 80 : 220
  const sentence = /[.!?…]+\s/.exec(text)
  if (sentence && sentence.index + sentence[0].length <= limit) return sentence.index + sentence[0].length
  if (text.length > limit) {
    const space = text.lastIndexOf(' ', limit - 1)
    return space > 40 ? space + 1 : limit
  }
  return final ? text.length : 0
}
