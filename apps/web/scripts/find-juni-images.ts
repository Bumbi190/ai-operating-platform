/**
 * find-juni-images.ts
 *
 * 1. Listar runs för att hitta Juni-körningen (Familje-Stunden / Juni månad)
 * 2. Listar bilder i run-images bucketen för den körningen
 * 3. Kopierar bilderna till references/juni/ med rena namn
 *
 * Kör med: npx tsx scripts/find-juni-images.ts
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
  console.log('🔍 Söker efter runs...\n')

  // Hämta senaste körningar för att hitta Juni
  const { data: runs, error: runsError } = await supabase
    .from('runs')
    .select('id, workflow_id, status, created_at, context, workflows(name)')
    .order('created_at', { ascending: false })
    .limit(20)

  if (runsError) {
    console.error('❌ Fel vid hämtning av runs:', runsError.message)
    process.exit(1)
  }

  console.log('Senaste körningar:')
  for (const run of runs ?? []) {
    const wf = Array.isArray(run.workflows) ? run.workflows[0] : run.workflows
    const ctx = run.context as any
    const hasSaga = !!(ctx?.sagabilder || ctx?.sagabilder_urls)
    const hasAkt = !!(ctx?.aktivitetsbilder || ctx?.aktivitetsbilder_urls)
    const hasBilder = !!(ctx?.bilder || ctx?.bilder_urls)
    console.log(
      `  ${run.id.slice(0, 8)}... | ${run.status.padEnd(10)} | ${run.created_at.slice(0, 10)} | ${(wf?.name ?? '—').slice(0, 40)} | saga:${hasSaga ? '✓' : '✗'} akt:${hasAkt ? '✓' : '✗'} bilder:${hasBilder ? '✓' : '✗'}`
    )
  }

  // Hitta Juni-körning: leta efter "juni" i workflow-namn eller senaste körning med bilder
  console.log('\n📂 Söker bilder i Storage...')

  // Lista alla mapper i runs/
  const { data: folders, error: listError } = await supabase.storage
    .from('run-images')
    .list('runs', { limit: 50, sortBy: { column: 'created_at', order: 'desc' } })

  if (listError) {
    console.error('❌ Fel vid listning av Storage:', listError.message)
    process.exit(1)
  }

  console.log('\nMappar i run-images/runs/:')
  for (const f of folders ?? []) {
    console.log(`  ${f.name}`)
  }

  // Matcha mappar mot kända runs med bilder
  const juniCandidates = (runs ?? []).filter(r => {
    const wf = Array.isArray(r.workflows) ? r.workflows[0] : r.workflows
    const name = (wf?.name ?? '').toLowerCase()
    return name.includes('juni') || name.includes('june') || name.includes('sommar')
  })

  console.log('\n🗓️  Körningar med "juni/june/sommar" i workflow-namn:')
  for (const r of juniCandidates) {
    const wf = Array.isArray(r.workflows) ? r.workflows[0] : r.workflows
    console.log(`  ${r.id} | ${r.created_at.slice(0, 10)} | ${wf?.name}`)

    // Lista bilder för denna run
    const { data: files } = await supabase.storage
      .from('run-images')
      .list(`runs/${r.id}`, { limit: 100 })

    if (files && files.length > 0) {
      console.log(`    → ${files.length} bilder: ${files.map(f => f.name).join(', ')}`)
    } else {
      console.log(`    → inga bilder`)
    }
  }

  // Kolla alla runs med bilder
  console.log('\n📸 Alla runs med bilder i Storage:')
  for (const folder of folders ?? []) {
    const runId = folder.name
    const { data: files } = await supabase.storage
      .from('run-images')
      .list(`runs/${runId}`, { limit: 100 })

    if (files && files.length > 0) {
      const sagaCount = files.filter(f => f.name.startsWith('saga-')).length
      const aktCount = files.filter(f => f.name.startsWith('aktivitet-')).length
      const imgCount = files.filter(f => f.name.startsWith('image-')).length
      console.log(`  ${runId} | saga:${sagaCount} akt:${aktCount} img:${imgCount} | filer: ${files.map(f => f.name).join(', ')}`)
    }
  }
}

main().catch(console.error)
