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

  const res = await fetch('https://api.ideogram.ai/generate', {
    method: 'POST',
    headers: {
      'Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_request: {
        prompt,
        aspect_ratio: 'ASPECT_9_16',
        model: 'V_3',
        style_type: 'REALISTIC',
        negative_prompt: 'text, words, letters, watermark, logo, blurry, low quality, distorted faces, cartoon, anime',
      },
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

  const systemPrompt = `You are a cinematographer and visual director specializing in premium short-form AI news videos.

Given a video script, generate EXACTLY 5 cinematic scene image prompts.

Rules:
- Each prompt describes a single, visually distinct scene (~12 seconds of screen time)
- Prompts should be atmospheric, cinematic, and match the script's narrative arc
- Style: photorealistic, editorial photography, cinematic lighting, dramatic but clean
- NO text, NO people's faces, NO logos, NO generic "AI art" clichés
- Think: Apple keynote B-roll, high-end documentary, Wired magazine photography
- Each scene should feel visually progressive (establish → detail → concept → data → payoff)
- Use specific, concrete visual language (e.g. "close-up macro photograph of glowing fiber optic cables" not "AI technology")

Return ONLY a JSON array of 5 objects:
[
  { "scene": 1, "prompt": "...", "rationale": "..." },
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
