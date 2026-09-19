import { describe, expect, it } from 'vitest'
import { IncrementalSpeechSegmenter, toSpeechText } from '@/lib/atlas/speech-segmenter'

function feed(chunks: string[], final = true) {
  const segmenter = new IncrementalSpeechSegmenter()
  const segments = chunks.flatMap(chunk => segmenter.push(chunk))
  if (final) segments.push(...segmenter.push('', true))
  return segments
}

describe('Atlas speech segmenter', () => {
  it('reconstructs the streamed answer exactly once', () => {
    const source = 'Först kommer detta, och sedan fortsätter svaret. Därefter är vi klara!'
    const segments = feed(['Först kommer ', 'detta, och sedan ', 'fortsätter svaret. Därefter ', 'är vi klara!'])
    expect(segments.map(segment => segment.text).join('')).toBe(source)
  })

  it('uses a natural soft boundary before the full sentence is complete', () => {
    const segments = feed([
      'Jag har granskat dagens viktigaste signaler, ',
      'och allt ser stabilt ut just nu.',
    ], false)
    expect(segments[0]).toEqual({
      text: 'Jag har granskat dagens viktigaste signaler, ',
      boundary: 'soft',
    })
  })

  it('releases a useful short clause at an em dash', () => {
    const source = 'Tre leads i Familje-Stunden väntar på uppföljning — resten ser stabilt ut.'
    const segments = feed([source], false)

    expect(segments).toEqual([{
      text: 'Tre leads i Familje-Stunden väntar på uppföljning — ',
      boundary: 'soft',
    }])
  })

  it('keeps short filler and acknowledgements buffered at soft punctuation', () => {
    const segmenter = new IncrementalSpeechSegmenter()
    expect(segmenter.push('Absolut, ')).toEqual([])
    expect(segmenter.push('jag tittar på det, ')).toEqual([])
  })

  it('does not emit tiny fragments mid-stream', () => {
    const segmenter = new IncrementalSpeechSegmenter()
    expect(segmenter.push('Ja. ')).toEqual([])
    const emitted = segmenter.push('Jag tar hand om nästa steg nu. ')
    expect(emitted[0].text).toBe('Ja. Jag tar hand om nästa steg nu. ')
  })

  it('protects Swedish abbreviations, decimals, times and URLs', () => {
    const source = 'Vi såg bl.a. 3.14 vid kl. 08:30 på https://omnira.se/docs. Resultatet är stabilt nu.'
    const segments = feed([source])
    expect(segments.map(segment => segment.text).join('')).toBe(source)
    expect(segments).toHaveLength(1)
  })

  it('preserves markdown source and segment order exactly', () => {
    const source = '**Status:** tre viktiga signaler är stabila — [öppna rapporten](https://omnira.se/docs).'
    const segments = feed([source.slice(0, 35), source.slice(35)])
    expect(segments.map(segment => segment.text).join('')).toBe(source)
  })

  it('flushes a final unterminated answer', () => {
    expect(feed(['Det här saknar slutpunkt'])).toEqual([
      { text: 'Det här saknar slutpunkt', boundary: 'final' },
    ])
  })

  it('removes presentation markdown only from spoken text', () => {
    const visible = '**Status:** [öppna rapporten](https://omnira.se)'
    expect(toSpeechText(visible)).toBe('Status: öppna rapporten')
    expect(visible).toContain('https://omnira.se')
  })
})
