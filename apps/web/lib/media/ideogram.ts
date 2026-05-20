/**
 * Ideogram v3 image generation service for AI Media Automation.
 *
 * Used to generate cinematic background images for short-form videos.
 * Each image corresponds to a ~12–15 second scene in the video.
 */

export interface IdeogramImage {
  url: string
  prompt: string
}

/**
 * Generate a single cinematic image from a prompt using Ideogram v3.
 * Returns the image URL (hosted by Ideogram).
 */
export async function generateIdeogramImage(prompt: string): Promise<string> {
  const apiKey = process.env.IDEOGRAM_API_KEY
  if (!apiKey) throw new Error('IDEOGRAM_API_KEY not set')

  const res = await fetch('https://api.ideogram.ai/v1/ideogram-v3/generate', {
    method: 'POST',
    headers: {
      'Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      aspect_ratio: '9x16',
      style_type: 'REALISTIC',
      rendering_speed: 'DEFAULT',
      negative_prompt: 'text, words, letters, numbers, captions, subtitles, watermark, logo, people, person, human, face, hands, crowd, blurry, low quality, distorted, cartoon, anime, stock photography look',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Ideogram API error ${res.status}: ${err}`)
  }

  const data = await res.json() as {
    data: Array<{ url: string }>
  }

  const url = data.data?.[0]?.url
  if (!url) throw new Error('Ideogram returned no image URL')
  return url
}

/**
 * Given a video script, use Claude to generate 5 cinematic scene prompts,
 * then generate images for each scene using Ideogram v3.
 *
 * Returns an array of 5 public image URLs.
 */
export async function generateSceneImages(
  script: string,
  hook: string,
): Promise<IdeogramImage[]> {
  // Use Claude to segment script → visual scene descriptions
  const { Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic()

  const systemPrompt = `You are a cinematographer and visual director for premium short-form AI documentary content.

Given a video script, generate EXACTLY 5 cinematic scene image prompts for a VERTICAL (9:16) format.

Rules:
- Each prompt is a single atmospheric scene (~12 seconds of screen time)
- Match the script's narrative arc: establish → deepen → illustrate concept → data/proof → payoff
- Style: photorealistic editorial photography, cinematic lighting, dramatic depth-of-field
- ABSOLUTELY NO: people, faces, hands, humans, crowds, text, letters, numbers, watermarks, logos
- Think: Apple product launch B-roll, Wired magazine tech photography, BBC documentary establishing shots
- Favor: architectural details, macro textures, dramatic light on objects, abstract data visualization in physical form, nature + technology intersections
- Vertical composition: tall subjects, dramatic top-to-bottom depth, sky-to-ground shots
- Specific and concrete (e.g. "extreme close-up of molten silicon on a semiconductor wafer, orange glow, dark background, macro lens" NOT "AI chip")

Return ONLY valid JSON — a flat array of 5 objects, no markdown fences:
[
  { "scene": 1, "prompt": "...", "rationale": "one sentence on why this fits the narrative moment" },
  ...
]`

  const userMsg = `Hook: "${hook}"

Script:
${script}

Generate 5 cinematic scene prompts for this video.`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{ role: 'user', content: userMsg }],
    system: systemPrompt,
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  // Parse JSON (strip markdown fences if present)
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) throw new Error('Claude returned invalid scene prompts')

  const scenes = JSON.parse(jsonMatch[0]) as Array<{ scene: number; prompt: string }>

  // Generate images in parallel (max 5 concurrent)
  console.log(`🎨 Generating ${scenes.length} scene images...`)
  const images = await Promise.all(
    scenes.map(async (scene, i) => {
      console.log(`  Scene ${i + 1}: ${scene.prompt.slice(0, 60)}...`)
      const url = await generateIdeogramImage(scene.prompt)
      return { url, prompt: scene.prompt }
    }),
  )

  return images
}
