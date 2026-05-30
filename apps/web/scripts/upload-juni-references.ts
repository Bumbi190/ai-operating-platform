/**
 * upload-juni-references.ts
 *
 * Laddar upp Juni-referensbilder från lokal mapp till Supabase Storage
 * under sökvägen references/juni/ med rena, förutsägbara namn.
 *
 * Mappning:
 *   Omslags bild.png              → references/juni/omslag.png
 *   Innehålls sida.png            → references/juni/innehall.png
 *   Sagan.png                     → references/juni/saga-forsida.png
 *   Sagan/Sagan Juni månad/Omslagsbild sagan.png → references/juni/saga-omslag.png
 *   Sagan/Sagan Juni månad/Saga bild 1-16.png    → references/juni/saga-1.png … saga-16.png
 *   Sagan/Sagan Juni månad/Avslutnings bild.png  → references/juni/saga-avslutning.png
 *   Färgläggningsbild 1.png       → references/juni/image-1.png
 *   Färgläggningsbild 2.png       → references/juni/image-2.png
 *   Färgläggnings bild 3.png      → references/juni/image-3.png
 *   Färgläggnings bild 4.png      → references/juni/image-4.png
 *   Färgläggnings bild 5.png      → references/juni/image-5.png
 *   Bygg i sanden.png             → references/juni/aktivitet-1.png
 *   Pack resväskan.png            → references/juni/aktivitet-2.png
 *   Resedagbok.png                → references/juni/aktivitet-3.png
 *   Sommardjur på äventyr.png     → references/juni/aktivitet-4.png
 *   Strandjakt.png                → references/juni/aktivitet-5.png
 *   Vatten expriment.png          → references/juni/aktivitet-6.png
 *
 * Kör med: npx tsx scripts/upload-juni-references.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Hitta Juni-mappen oavsett teckenkodning (NFD vs NFC)
function findJuniDir(): string {
  const candidates = [
    '/Users/andrehultgren/Desktop',
    path.join(process.env.HOME ?? '', 'Desktop'),
  ]
  for (const base of candidates) {
    if (!fs.existsSync(base)) continue
    const entries = fs.readdirSync(base)
    const dir = entries.find(e => e.toLowerCase().includes('juni'))
    if (dir) return path.join(base, dir)
  }
  throw new Error('Hittade inte Juni-mappen på Desktop')
}

async function uploadFile(localPath: string, storagePath: string): Promise<boolean> {
  if (!fs.existsSync(localPath)) {
    console.warn(`  ⚠️  Saknas lokalt: ${localPath}`)
    return false
  }

  const buffer = fs.readFileSync(localPath)
  const { error } = await supabase.storage
    .from('run-images')
    .upload(storagePath, buffer, {
      contentType: 'image/png',
      upsert: true,
    })

  if (error) {
    console.error(`  ❌ Fel vid uppladdning av ${storagePath}: ${error.message}`)
    return false
  }

  const { data } = supabase.storage.from('run-images').getPublicUrl(storagePath)
  console.log(`  ✓ ${storagePath}`)
  return true
}

async function main() {
  const juniDir = findJuniDir()
  const sagaDir = path.join(juniDir, 'Sagan')

  // Hitta sagan-undermappen — måste vara en katalog, inte mp3-filen
  const sagaEntries = fs.readdirSync(sagaDir)
  const sagaSubDir = sagaEntries.find(e => {
    const fullPath = path.join(sagaDir, e)
    return e.toLowerCase().includes('sagan juni') && fs.statSync(fullPath).isDirectory()
  })
  if (!sagaSubDir) throw new Error('Hittade inte Sagan Juni månad-mappen i ' + sagaDir)
  const sagaBildDir = path.join(sagaDir, sagaSubDir)

  console.log('📂 Juni-mapp:', juniDir)
  console.log('📂 Saga-mapp:', sagaBildDir)
  console.log('\n🚀 Laddar upp referensbilder till Supabase Storage...\n')

  let ok = 0
  let fail = 0

  const upload = async (local: string, storage: string) => {
    const success = await uploadFile(local, `references/juni/${storage}`)
    success ? ok++ : fail++
  }

  // ── Huvudsidor ───────────────────────────────────────────────────────────────
  console.log('── Huvudsidor ──')
  await upload(path.join(juniDir, 'Omslags bild.png'),   'omslag.png')
  await upload(path.join(juniDir, 'Innehålls sida.png'), 'innehall.png')
  await upload(path.join(juniDir, 'Sagan.png'),          'saga-forsida.png')
  await upload(path.join(juniDir, 'Krysslistan.png'),    'krysslistan.png')
  await upload(path.join(juniDir, 'Diplom.png'),         'diplom.png')
  await upload(path.join(juniDir, 'Avslutnings sida.png'), 'avslutning.png')

  // ── Sagabilder ───────────────────────────────────────────────────────────────
  console.log('\n── Sagabilder ──')
  await upload(path.join(sagaBildDir, 'Omslagsbild sagan.png'),  'saga-omslag.png')
  for (let i = 1; i <= 16; i++) {
    await upload(path.join(sagaBildDir, `Saga bild ${i}.png`), `saga-${i}.png`)
  }
  await upload(path.join(sagaBildDir, 'Avslutnings bild.png'), 'saga-avslutning.png')

  // ── Färgläggningsbilder ──────────────────────────────────────────────────────
  console.log('\n── Färgläggningsbilder ──')
  await upload(path.join(juniDir, 'Färgläggningsbild 1.png'),   'image-1.png')
  await upload(path.join(juniDir, 'Färgläggningsbild 2.png'),   'image-2.png')
  await upload(path.join(juniDir, 'Färgläggnings bild 3.png'),  'image-3.png')
  await upload(path.join(juniDir, 'Färgläggnings bild 4.png'),  'image-4.png')
  await upload(path.join(juniDir, 'Färgläggnings bild 5.png'),  'image-5.png')

  // ── Aktivitetsbilder ─────────────────────────────────────────────────────────
  console.log('\n── Aktivitetsbilder ──')
  await upload(path.join(juniDir, 'Bygg i sanden.png'),          'aktivitet-1.png')
  await upload(path.join(juniDir, 'Pack resväskan.png'),         'aktivitet-2.png')
  await upload(path.join(juniDir, 'Resedagbok.png'),             'aktivitet-3.png')
  await upload(path.join(juniDir, 'Sommardjur på äventyr.png'),  'aktivitet-4.png')
  await upload(path.join(juniDir, 'Strandjakt.png'),             'aktivitet-5.png')
  await upload(path.join(juniDir, 'Vatten expriment.png'),       'aktivitet-6.png')

  // ── Sammanfattning ───────────────────────────────────────────────────────────
  console.log(`\n✅ Klart! ${ok} bilder uppladdade, ${fail} misslyckades.`)

  if (ok > 0) {
    const { data } = supabase.storage.from('run-images').getPublicUrl('references/juni/omslag.png')
    console.log('\nPublic URL-bas:', data.publicUrl.replace('omslag.png', ''))
  }
}

main().catch(console.error)
