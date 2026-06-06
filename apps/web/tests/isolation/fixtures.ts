/**
 * PR-0 / leak-harness — two-owner / two-project fixture.
 *
 * Creates owner A and owner B (distinct auth users), one project each, and seeds a row
 * for project B in each tenant table. The leak tests then prove that A (and anon) can
 * never see B's rows.
 *
 * Measurement only — runs against a DISPOSABLE Supabase test branch, never prod.
 * Uses the service-role admin auth API for setup/teardown.
 *
 * NOTE: authored in PR-0; not executed here. The per-table seed map is intentionally
 * minimal and must be completed against the live schema during the first green run —
 * each entry only needs the NOT NULL columns + project_id.
 */
import { service, asUser } from './clients';

export type Fixture = {
  ownerA: string; ownerB: string;
  projectA: string; projectB: string;
  tokenA: string; tokenB: string;
  seededTables: string[];
};

const PW = 'Test-Passw0rd!isolation';

async function createOwner(email: string): Promise<{ id: string; token: string }> {
  const db = service();
  const { data, error } = await db.auth.admin.createUser({
    email, password: PW, email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);

  // Sign in (anon client) to obtain a real access token for RLS-as-user.
  const { createClient } = await import('@supabase/supabase-js');
  const anonClient = createClient(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: s, error: e2 } = await anonClient.auth.signInWithPassword({ email, password: PW });
  if (e2 || !s.session) throw new Error(`signIn ${email}: ${e2?.message}`);
  return { id: data.user.id, token: s.session.access_token };
}

async function createProject(ownerId: string, slug: string): Promise<string> {
  const db = service();
  const { data, error } = await db.from('projects')
    .insert({ owner_id: ownerId, name: slug, slug }).select('id').single();
  if (error || !data) throw new Error(`createProject ${slug}: ${error?.message}`);
  return (data as { id: string }).id;
}

/**
 * Seed one row for project B in each tenant table.
 * Keep entries minimal (NOT NULL columns + project_id). Extend against live schema.
 */
async function seedForProject(projectId: string): Promise<string[]> {
  const db = service();
  const seeded: string[] = [];
  const seeds: Array<[string, Record<string, unknown>]> = [
    ['agents',         { project_id: projectId, name: 'iso-seed' }],
    ['workflows',      { project_id: projectId, name: 'iso-seed' }],
    ['runs',           { project_id: projectId, status: 'pending' }],
    ['leads',          { project_id: projectId, name: 'iso-seed' }],
    ['campaigns',      { project_id: projectId, name: 'iso-seed' }],
    ['revenue_events', { project_id: projectId, amount_sek: 1 }],
    ['manager_tasks',  { project_id: projectId, title: 'iso-seed', status: 'pending' }],
    // extend with: outputs, memories, conversations, campaign_plans, draft_posts, ...
  ];
  for (const [table, row] of seeds) {
    const { error } = await db.from(table).insert(row);
    if (!error) seeded.push(table);
    else console.warn(`[fixture] seed ${table} skipped: ${error.message}`);
  }
  return seeded;
}

export async function setup(): Promise<Fixture> {
  const a = await createOwner(`iso-a+${Date.now()}@example.test`);
  const b = await createOwner(`iso-b+${Date.now()}@example.test`);
  const projectA = await createProject(a.id, `iso-a-${Date.now()}`);
  const projectB = await createProject(b.id, `iso-b-${Date.now()}`);
  const seededTables = await seedForProject(projectB);
  return { ownerA: a.id, ownerB: b.id, projectA, projectB, tokenA: a.token, tokenB: b.token, seededTables };
}

export async function teardown(f: Fixture): Promise<void> {
  const db = service();
  // Projects cascade-delete child rows (ON DELETE CASCADE); then remove the auth users.
  await db.from('projects').delete().eq('id', f.projectA);
  await db.from('projects').delete().eq('id', f.projectB);
  await db.auth.admin.deleteUser(f.ownerA).catch(() => {});
  await db.auth.admin.deleteUser(f.ownerB).catch(() => {});
}

export { asUser };
