import { randomUUID } from 'node:crypto'
import { initializeWorkerDb, testSql } from '../test-db'
import type { BuildPrincipal } from '../types'

export const sqlJson = (value: unknown) => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb"
export function createStudioFixture() {
  const db = initializeWorkerDb()
  const ownerId = randomUUID(), foreignId = randomUUID()
  const projectId = randomUUID(), otherProjectId = randomUUID(), foreignProjectId = randomUUID()
  testSql(`insert into auth.users(id) values('${ownerId}'),('${foreignId}');
    alter table project_budgets add column if not exists daily_sek numeric,add column if not exists weekly_sek numeric,add column if not exists updated_at timestamptz default now();
    insert into projects(id,owner_id,name,slug) values
    ('${projectId}','${ownerId}','Befintligt','existing-${projectId}'),
    ('${otherProjectId}','${ownerId}','Andra projektet','other-${otherProjectId}'),
    ('${foreignProjectId}','${foreignId}','Främmande','foreign-${foreignProjectId}');`)
  const owner: BuildPrincipal = { userId: ownerId, allowedProjectIds: [projectId, otherProjectId] }
  const foreign: BuildPrincipal = { userId: foreignId, allowedProjectIds: [foreignProjectId] }
  return {
    db, owner, foreign, projectId, otherProjectId, foreignProjectId,
    countOwnedProjects: () => Number(testSql(`select count(*) from projects where owner_id='${ownerId}';`)),
    builder: async (id: string) => JSON.parse(testSql(`select jsonb_build_object('id',a.id,'projectId',a.project_id,'model',a.model,'maxTokens',a.config->'max_tokens','config',a.config,'skills',a.skill_ids) from agents a join website_build_project_settings s on s.builder_agent_id=a.id where s.project_id='${id}';`)),
    reset: () => testSql(`update runs set status='failed' where project_id in ('${projectId}','${otherProjectId}') and status in ('pending','running');`),
  }
}
