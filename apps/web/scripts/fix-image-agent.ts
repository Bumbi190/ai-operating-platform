/**
 * Fix script: Uppdaterar DALL-E Bildgenerator till gpt-image-1
 * och Bildprompt-designer system prompt (tar bort DALL-E 3-referens)
 *
 * Kör med: npx tsx scripts/fix-image-agent.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function main() {
  console.log('🔧 Fixar bildgenerator-konfiguration...\n')

  // 1. Uppdatera DALL-E Bildgenerator → gpt-image-1
  const { data: imageAgents, error: fetchErr } = await supabase
    .from('agents')
    .select('id, name, model')
    .eq('name', 'DALL-E Bildgenerator')

  if (fetchErr) {
    console.error('❌ Kunde inte hämta agenter:', fetchErr.message)
    process.exit(1)
  }

  console.log(`Hittade ${imageAgents?.length ?? 0} DALL-E Bildgenerator-agent(er)`)

  for (const agent of imageAgents ?? []) {
    console.log(`  → ${agent.name} (${agent.id}): model=${agent.model}`)

    if (agent.model === 'gpt-image-1') {
      console.log('    ✅ Redan korrekt, skippar')
      continue
    }

    const { error: updateErr } = await supabase
      .from('agents')
      .update({
        model: 'gpt-image-1',
        description: 'Genererar färgläggningsbilder med gpt-image-1',
        system_prompt: 'Genererar bilder med gpt-image-1. Input ska vara JSON-array med prompts.',
      })
      .eq('id', agent.id)

    if (updateErr) {
      console.error(`    ❌ Uppdatering misslyckades:`, updateErr.message)
    } else {
      console.log(`    ✅ Uppdaterad till gpt-image-1`)
    }
  }

  // 2. Uppdatera Bildprompt-designer system prompt (ta bort DALL-E 3-referens + style-param)
  const { data: promptAgents, error: promptFetchErr } = await supabase
    .from('agents')
    .select('id, name, system_prompt, config')
    .eq('name', 'Bildprompt-designer')

  if (promptFetchErr) {
    console.error('❌ Kunde inte hämta Bildprompt-designer:', promptFetchErr.message)
  } else {
    for (const agent of promptAgents ?? []) {
      console.log(`\n  → ${agent.name} (${agent.id})`)

      // Check if config has 'style' param
      const config = agent.config as Record<string, unknown> ?? {}
      const hasStyle = 'style' in config

      const newSystemPrompt = `Du skapar bildprompts för DALL-E (gpt-image-1) som genererar FÄRGLÄGGNINGSBILDER för barn.

Givet ett tema ska du skapa exakt 4 bildprompts som passar som färgläggningssidor.

Regler för varje prompt:
- Börja alltid med: "Black and white coloring page for children, simple bold line art, no shading, white background, clean outlines,"
- Beskriv en tydlig, enkel scen kopplad till temat
- Barnvänlig, söt stil
- Inga detaljer som är svåra att färglägga
- Avsluta med: "suitable for ages 3-8, printable quality"

Svara ENBART med ett JSON-array med 4 strängar, inget annat:
["prompt 1", "prompt 2", "prompt 3", "prompt 4"]`

      const updates: Record<string, unknown> = { system_prompt: newSystemPrompt }

      if (hasStyle) {
        const { style: _removed, ...restConfig } = config as { style: unknown } & Record<string, unknown>
        updates.config = restConfig
        console.log('    Tar bort "style" från config')
      }

      const { error: updateErr } = await supabase
        .from('agents')
        .update(updates)
        .eq('id', agent.id)

      if (updateErr) {
        console.error(`    ❌ Uppdatering misslyckades:`, updateErr.message)
      } else {
        console.log(`    ✅ Bildprompt-designer uppdaterad`)
      }
    }
  }

  console.log('\n🎉 Fix klar!')
}

main().catch(console.error)
