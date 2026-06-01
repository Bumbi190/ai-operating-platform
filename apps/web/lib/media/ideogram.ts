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
      content: `You are the photo director for a premium AI news channel. Your job: write ONE photorealistic image prompt for a vertical news thumbnail.

HEADLINE: "${headline}"
SCRIPT: "${script.slice(0, 700)}"

OBJECTIVE: The image must feel like a real Reuters or Bloomberg photo — not AI concept art.

STEP 1 — Identify the most specific physical subject from this story:
- A named company → their actual building, server infrastructure, or hardware product
- A specific AI model → the hardware it runs on (GPU rack, data center, chip close-up)
- A regulation/law → government building exterior, printed document close-up, empty courtroom
- Research breakthrough → lab equipment, silicon wafer, microscope, printed paper on desk
- Startup/funding → co-working office, whiteboard with writing, hardware prototype

APPROVED VISUAL VOCABULARY (pick from these):
• "dense server rack corridor, twin rows of blinking rack units, emergency blue LED strips, deep perspective, photorealistic"
• "extreme macro: NVIDIA H100 GPU die surface, industrial lighting, black background, ultra-sharp detail"
• "semiconductor cleanroom interior, yellow safelight, workers in bunny suits, precise industrial photography"
• "developer workstation at 2am: multiple monitors with terminal windows, dark desk, harsh monitor glow"
• "silicon wafer on clean surface, polarized light creating rainbow diffraction patterns, macro photography"
• "data center cooling pipes, condensation, industrial blue-green lighting, vertical crop"
• "robotics lab: mechanical arm mid-motion, clean white environment, motion blur, editorial photography"
• "government building facade at dusk, dramatic storm clouds, Reuters photojournalism style"
• "crumpled printed spreadsheet on dark desk, single spotlight from above, financial data visible"
• "GPU cluster overhead view, cables organized in paths, birds-eye perspective, real facility"

STRICTLY FORBIDDEN:
- Glowing AI brains, neural network visualizations, floating orbs, digital particles
- Abstract "future AI" imagery, cyberpunk aesthetics, neon light trails
- Any person, face, hands, or crowd
- Text or logos in the image
- Generic stock photography look

LIGHTING: dark and dramatic — the image will have text overlaid on top.
FORMAT: vertical 9:16, photorealistic, editorial photography quality.

Output ONLY the final prompt string. No explanation.`,
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

// ─── Scene Intent System ──────────────────────────────────────────────────────

interface SceneIntent {
  scene: number
  narrative_purpose: 'setup' | 'tension' | 'explanation' | 'implication' | 'consequence' | 'future_impact'
  emotional_intent: 'curiosity' | 'urgency' | 'realism' | 'scale' | 'disruption' | 'concern' | 'excitement' | 'gravity'
  environment: string
  visual_concept: string
}

/**
 * Generate story-driven scene images using a two-step Scene Intent System.
 *
 * Step 1 — Scene Planning: Claude analyzes the script narrative and assigns each
 * scene a narrative purpose, emotional intent, environment, and visual concept.
 * Images serve the STORY, not a generic "AI aesthetic".
 *
 * Step 2 — Image Generation: Ideogram renders each scene from the intent-driven
 * prompt. Human environments encouraged; fake readable text strictly blocked.
 *
 * Narrative purposes: setup → tension → explanation → implication → future_impact
 * The result should feel like a documentary, not an AI moodboard.
 */
export async function generateNewsImages(
  headline: string,
  script: string,
  count: number = 3,
): Promise<string[]> {
  const { Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic()

  // ── Step 1: Scene planning ──────────────────────────────────────────────────
  const planRes = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `You are the visual director for "The Prompt" — a high-tension AI insider news channel.

HEADLINE: "${headline}"
SCRIPT: "${script.slice(0, 900)}"

Plan ${count} scenes. The images must support THIS specific story — not generic AI aesthetics.
Read the script. Identify the actual companies, products, stakes, and consequences mentioned. Build visuals around those specifics.

NARRATIVE PURPOSES (one per scene, progress the story arc):
- setup: the situation that makes this story important RIGHT NOW
- tension: the conflict, the race, the decision being made
- explanation: the mechanism — what exactly happened or changed
- implication: what this means for developers, companies, or the industry
- consequence: the real-world effect — winners, losers, shifts in power

EMOTIONAL INTENTS (one per scene):
urgency | disruption | gravity | scale | realism | concern | curiosity | insider

STORY-SPECIFIC ENVIRONMENTS — tie each scene directly to entities in the script:

If the story is about a specific company → their physical environment:
- OpenAI / Anthropic office: modern SF tech campus at dusk, glass facade, serious energy
- Nvidia: GPU manufacturing, H100 hardware rack, semiconductor facility
- Google / DeepMind: research campus, whiteboard-covered glass walls, complex diagrams
- Meta / Apple: sleek corporate campus exterior, dusk, architectural scale
- Startups (Cursor, Windsurf, Perplexity): startup war room, late night, multiple monitors

If the story is about model performance / benchmarks:
- Benchmark testing environment: servers running hot, monitoring screens, real facility
- GPU cluster under load: cooling systems, dense cables, operational infrastructure
- Engineering team reviewing results: from behind, multiple screens, late night, tension

If the story is about developers / tools:
- Late-night developer workstation: 2AM, ultrawide monitors, warm desk lamp, empty coffee cup
- Coding workspace: mechanical keyboard, terminal glow, focused solitude
- Team sprint: multiple developers visible from behind, collaborative tension

If the story is about policy / regulation / business:
- Government building facade: serious architecture, dusk light, Reuters photojournalism style
- Executive boardroom: empty chairs, tension, decisions being made
- Printed documents on dark desk: single spotlight, financial data visible but not readable

Hardware close-ups (always available as scene variety):
- NVIDIA H100 die: extreme macro, industrial lighting, black background
- Silicon wafer: polarized light, rainbow diffraction, macro photography
- Server rack corridor: emergency lighting, deep perspective, operational
- Circuit board traces: warm golden sidelighting, extreme shallow depth of field

CRITICAL RULES:
- Each scene: completely different environment and composition — no repeating datacenter
- Ground EVERY scene in a specific entity or beat from this exact story
- People welcome but NO visible faces — from behind, silhouette, hands only
- NO readable text, fake UI, fake dashboards, fake terminals — they break immersion
- Lighting: dark and dramatic — text will be overlaid on top

Return ONLY valid JSON — array of ${count} scene objects, no markdown:
[
  {
    "scene": 1,
    "narrative_purpose": "setup",
    "emotional_intent": "urgency",
    "environment": "late-night developer workstation",
    "visual_concept": "Developer seen from behind at ultrawide monitor setup, 2AM, warm amber desk lamp casting long shadows across mechanical keyboard, empty coffee cup, intense focused silence, documentary editorial photo"
  }
]`,
    }],
  })

  const planText = planRes.content[0].type === 'text' ? planRes.content[0].text.trim() : '[]'
  const planMatch = planText.match(/\[[\s\S]*\]/)
  const scenes = planMatch ? JSON.parse(planMatch[0]) as SceneIntent[] : []

  if (scenes.length === 0) throw new Error('generateNewsImages: scene planning returned no scenes')

  // ── Step 2: Generate each scene image from its intent ───────────────────────
  // Block fake text/UI but allow human presence (from behind, silhouettes)
  const negativePrompt = [
    'readable text', 'readable interface', 'readable screen', 'visible text',
    'fake dashboard', 'fake email', 'fake terminal', 'chat messages', 'phone screen with text',
    'frontal face', 'visible face', 'portrait', 'direct eye contact', 'crowd',
    'abstract AI art', 'glowing orbs', 'neural network visualization', 'digital brain',
    'cyberpunk', 'neon lights', 'floating shapes', 'holographic',
    'blurry', 'low quality', 'distorted', 'cartoon', 'anime', 'stock photo look',
  ].join(', ')

  console.log(`🎬 Scene plan ready. Generating ${scenes.length} story-driven images in parallel...`)

  return Promise.all(
    scenes.map(async (scene, i) => {
      // Build final Ideogram prompt from scene intent
      const prompt = [
        scene.visual_concept,
        `${scene.environment}`,
        'cinematic editorial photography, 9:16 vertical format',
        'photorealistic, documentary film aesthetic',
        `${scene.emotional_intent} atmosphere`,
        'natural lighting, no visible text',
      ].join(', ')

      console.log(`  Scene ${i + 1} [${scene.narrative_purpose} / ${scene.emotional_intent}]: ${scene.visual_concept.slice(0, 65)}...`)

      const apiKey = process.env.IDEOGRAM_API_KEY
      if (!apiKey) throw new Error('IDEOGRAM_API_KEY not set')

      const ideogramRes = await fetch('https://api.ideogram.ai/v1/ideogram-v3/generate', {
        method: 'POST',
        headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          aspect_ratio: '9x16',
          style_type: 'REALISTIC',
          rendering_speed: 'TURBO',
          negative_prompt: negativePrompt,
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
    }),
  )
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
