/**
 * verify-setup.ts — Snabb hälsokontroll av miljö och Supabase-konfiguration
 *
 * Kör med: npx ts-node --skip-project scripts/verify-setup.ts
 * eller:   npx tsx scripts/verify-setup.ts
 */

const checks: Array<{ name: string; fn: () => Promise<string> }> = []

function check(name: string, fn: () => Promise<string>) {
  checks.push({ name, fn })
}

// ─── Miljövariabler ─────────────────────────────────────────────────────────

check('NEXT_PUBLIC_SUPABASE_URL', async () => {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!v || v.includes('your-project')) throw new Error('Ej konfigurerad')
  if (!v.startsWith('https://')) throw new Error('Måste börja med https://')
  return v
})

check('NEXT_PUBLIC_SUPABASE_ANON_KEY', async () => {
  const v = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!v || v === 'your-anon-key') throw new Error('Ej konfigurerad')
  if (v.length < 20) throw new Error('Verkar för kort — kontrollera nyckeln')
  return `${v.slice(0, 20)}...`
})

check('SUPABASE_SERVICE_ROLE_KEY', async () => {
  const v = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!v || v === 'your-service-role-key') throw new Error('Ej konfigurerad')
  if (v.length < 20) throw new Error('Verkar för kort — kontrollera nyckeln')
  return `${v.slice(0, 20)}...`
})

check('ANTHROPIC_API_KEY', async () => {
  const v = process.env.ANTHROPIC_API_KEY
  if (!v || !v.startsWith('sk-ant-')) throw new Error('Saknas eller fel format (ska börja med sk-ant-)')
  return `${v.slice(0, 15)}...`
})

// ─── Supabase-anslutning ────────────────────────────────────────────────────

check('Supabase anslutning (anon)', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  const { error } = await supabase.from('projects').select('id').limit(1)
  if (error && error.code !== 'PGRST116') throw new Error(error.message)
  return 'OK'
})

check('Supabase tabeller (projects)', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data, error } = await supabase.from('projects').select('id').limit(1)
  if (error) throw new Error(`Tabell saknas: ${error.message}`)
  return `OK (${data?.length ?? 0} rader synliga)`
})

check('Supabase tabeller (run_logs)', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { error } = await supabase.from('run_logs').select('id').limit(1)
  if (error) throw new Error(`Tabell saknas: ${error.message}`)
  return 'OK'
})

// ─── Anthropic ──────────────────────────────────────────────────────────────

check('Anthropic API (ping)', async () => {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 16,
    messages: [{ role: 'user', content: 'Svara med bara: OK' }],
  })
  const text = msg.content[0].type === 'text' ? msg.content[0].text : '?'
  return `OK — modell svarade: "${text.trim()}"`
})

// ─── Kör alla kontroller ────────────────────────────────────────────────────

async function main() {
  // Load .env.local
  try {
    const { config } = await import('dotenv')
    config({ path: '.env.local' })
  } catch {
    // dotenv kanske inte är installerat, fortsätt ändå
  }

  console.log('\n🔍 AI Operations Platform — Setup-verifiering\n')
  console.log('─'.repeat(55))

  let passed = 0
  let failed = 0

  for (const { name, fn } of checks) {
    process.stdout.write(`  ${name.padEnd(40)}`)
    try {
      const result = await fn()
      console.log(`✅ ${result}`)
      passed++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`❌ ${msg}`)
      failed++
    }
  }

  console.log('─'.repeat(55))

  if (failed === 0) {
    console.log(`\n✅ Alla ${passed} kontroller godkända — plattformen är redo!\n`)
    console.log('Starta dev-servern med: npm run dev')
    console.log('Öppna: http://localhost:3000\n')
  } else {
    console.log(`\n❌ ${failed} av ${passed + failed} kontroller misslyckades`)
    console.log('Se SYSTEM_STATUS.md → Snabbstart för instruktioner.\n')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('\nFatal error:', err)
  process.exit(1)
})
