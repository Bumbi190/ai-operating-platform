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
 * Generate a single editorial news image for SimpleNewsReel format.
 *
 * Uses Claude to write a tight photojournalism prompt grounded in the
 * actual news story, then generates with Ideogram REALISTIC mode.
 * No text is rendered in the image — Remotion overlays all text.
 *
 * This is ~5× cheaper than generateSceneImages() (1 call vs 5).
 */
export async function generateNewsImage(
  headline: string,
  script: string,
): Promise<string> {
  const { Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic()

  // Step 1: Claude writes a tight photojournalism prompt grounded in the news story
  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 350,
    messages: [{
      role: 'user',
      content: `You are a photojournalism director for a premium AI news channel (think Bloomberg, BBC News, Reuters).

Given this news story, write ONE Ideogram image generation prompt for a vertical 9:16 news thumbnail.

HEADLINE: "${headline}"
SCRIPT: "${script.slice(0, 600)}"

RULES:
- Pick the SINGLE most iconic physical object, location, or moment from this specific news story
- If it's about a company (e.g. OpenAI, Google, Apple): headquarters building exterior, product hardware close-up, or server room
- If it's about a product launch: the physical product or interface on a real screen
- If it's about regulation/government: government building, courtroom, official documents close-up
- If it's about research: laboratory equipment, printed research paper, scientist's workspace
- Photorealistic, editorial photography style — NOT concept art, NOT abstract AI visuals
- Dark/moody dramatic lighting so text overlay remains readable
- Vertical composition, no people or faces, no text in image

BAD examples (forbidden): "glowing neural network", "AI brain visualization", "abstract data streams", "futuristic hologram"
GOOD examples: "close-up of NVIDIA H100 GPU chip on dark surface, dramatic side lighting", "Google DeepMind London headquarters glass facade at dusk, dramatic clouds", "OpenAI office entrance sign in San Francisco financial district, blue hour lighting"

Output ONLY the prompt. No explanation, no preamble.`,
    }],
  })

  const visualPrompt = res.content[0].type === 'text' ? res.content[0].text.trim() : ''

  // Step 2: Generate with REALISTIC mode — photojournalism aesthetic
  const apiKey = process.env.IDEOGRAM_API_KEY
  if (!apiKey) throw new Error('IDEOGRAM_API_KEY not set')

  const ideogramRes = await fetch('https://api.ideogram.ai/v1/ideogram-v3/generate', {
    method: 'POST',
    headers: {
      'Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: visualPrompt,
      aspect_ratio: '9x16',
      style_type: 'REALISTIC',
      rendering_speed: 'DEFAULT',
      negative_prompt: 'text, words, letters, watermark, logo, people, person, face, hands, crowd, cartoon, anime, abstract, digital art, glowing orbs, neural network visualization, blurry, low quality, distorted, CGI render, science fiction, fantasy',
    }),
  })

  if (!ideogramRes.ok) {
    const err = await ideogramRes.text()
    throw new Error(`Ideogram API error ${ideogramRes.status}: ${err}`)
  }

  const data = await ideogramRes.json() as { data: Array<{ url: string }> }
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

  const systemPrompt = `You are the editorial photography director for a premium AI documentary short-form series — think Bloomberg QuickTake, Wired Magazine, BBC Click, and Apple product films.

Given a video script, generate EXACTLY 5 scene image prompts for VERTICAL (9:16) mobile format.

═══ CORE VISUAL BRIEF ═══
Target aesthetic: photorealistic editorial photography, cinematic and believable
NOT: generic AI art, glowing neural networks, floating data orbs, digital brain visualizations

EACH PROMPT MUST:
1. Name a SPECIFIC, TANGIBLE, PHYSICAL subject — a real object you could touch or photograph
2. Describe the EXACT lighting setup (direction, color temperature, source type)
3. Include the camera/lens style (macro, wide-angle looking up, tight telephoto, overhead)
4. Match the NARRATIVE MOMENT of that script section (not just look "tech-y")
5. Be tall/vertical — favor subjects with top-to-bottom depth

═══ STRICTLY FORBIDDEN ═══
- Abstractions: "futuristic AI", "neural network", "digital brain", "data visualization", "glowing orb"
- Any person, face, hands, body, crowd
- Text, numbers, captions, watermarks, logos
- Generic stock: "business person at computer", "person holding phone"
- Vague descriptors: "modern", "innovative", "cutting-edge", "advanced technology"

═══ VISUAL VOCABULARY (use this style) ═══
"extreme close-up macro: [specific object] under [specific light], [background], [lens characteristic]"
"looking up from below through [environment], [light direction], dramatic vertical framing"
"cinematic still: [objects] on [surface], [specific light source] casting [shadow/reflection]"
"film photography: [specific interior scene], [time of day], [mood and color grade]"
"overhead bird's-eye: [flat lay of specific objects], [surface material], [light quality]"

═══ CONCRETE EXAMPLES OF GOOD PROMPTS ═══
- "extreme macro close-up of silicon wafer surface, industrial blue-LED lighting from left, ultra-sharp micro-detail, black background, vertical orientation"
- "dark server room corridor, twin rows of rack hardware, emergency red LED strips on ceiling, deep one-point perspective, cool blue ambient light"
- "late-night desk: open laptop with terminal window, coffee mug with steam, scattered papers, cold monitor light on dark surface, shallow depth of field"
- "macro photography of copper circuit board traces, warm golden sidelighting, extreme shallow depth of field, black background, vertical crop"
- "looking up through glass atrium ceiling at geometric steel beams, overcast sky above, dramatic vertical composition, architectural photography"
- "close-up of old analog clock face, dramatic side-lighting casting long shadows, dark moody background, film photography grain"
- "industrial fiber optic cable cross-section, circular glowing points of light against pure black, scientific macro photography"

═══ NARRATIVE MATCHING ═══
Read the script carefully. Each scene should illustrate the SPECIFIC IDEA being discussed at that moment — not just look generically "tech."
- Script talks about memory? → physical notebook, filing cabinet drawers, stacked index cards
- Script talks about speed? → motion-blurred fiber, spinning hard drive internals
- Script talks about reasoning? → annotated printed diagram, chalkboard with logic notation
- Script talks about data? → physical punch cards, magnetic tape reels, printed spreadsheets

Return ONLY valid JSON — a flat array of 5 objects, no markdown fences:
[
  { "scene": 1, "prompt": "...", "rationale": "one sentence on why this visual matches this narrative moment" },
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
