// Disposable local security prerequisites. No hosted execution or source-wide replay.
import {sha256} from './migration-replay-preflight.mjs';
const SPECS=[
  {
    "pin": {
      "kind": "synthetic",
      "path": "synthetic/cron_heartbeat_security_only",
      "sourcePath": "supabase/migrations/20260707172102_enable_public_rls_for_internal_tables.sql",
      "sourceLfSha256": "e53cdcff2cc26fa22c19b3d42c180bf20c44596b06b173e6b5bf9308e742f3b5",
      "extractedLfSha256": "d09e62f5401bb3c492e31a29e83fea4df0a43e23c4d857621d2e6c77c676df1c",
      "lfSha256": "fc2f07449f3ecf901b36560f2585e1364beb09f369a52443611288180486b44f",
      "limitation": "Reviewed local empty-table security prerequisite only; no row seeding, unrelated tables, hosted migration or full parity claim."
    },
    "extracted": "alter table public.cron_heartbeat enable row level security;\nrevoke all on public.cron_heartbeat from anon, authenticated;\ngrant all on public.cron_heartbeat to service_role;\n",
    "body": "LOCK TABLE ONLY public.cron_heartbeat IN ACCESS EXCLUSIVE MODE;\nDO $guard$\nBEGIN\n IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) OR EXISTS (SELECT 1 FROM ONLY public.cron_heartbeat) OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.cron_heartbeat'::regclass) THEN\n RAISE EXCEPTION 'security fixture requires privileged empty table without policies';\n END IF;\nEND\n$guard$;\nalter table public.cron_heartbeat enable row level security;\nrevoke all on public.cron_heartbeat from anon, authenticated;\ngrant all on public.cron_heartbeat to service_role;\n",
    "table": "cron_heartbeat"
  },
  {
    "pin": {
      "kind": "synthetic",
      "path": "synthetic/platform_config_security_only",
      "sourcePath": "supabase/migrations/20260528_pass_a_safeguards.sql",
      "sourceLfSha256": "4665ac611487c0d833914c2b2e40de11b2e0433e9ed89d172b9b0e463e4c0c04",
      "extractedLfSha256": "d7cbee86b8a938a8475b22622a7a698d164cda8194e749ae4f3da5adfd8f3e1b",
      "lfSha256": "ebd18ff93df55acdaf6f1d279c29a4e2da5a91f8da21e86bf8763ce6f2c7f82a",
      "limitation": "Reviewed local empty-table security prerequisite only; no row seeding, unrelated tables, hosted migration or full parity claim."
    },
    "extracted": "ALTER TABLE platform_config ENABLE ROW LEVEL SECURITY;\nCREATE POLICY \"authenticated_read_platform_config\"\n  ON platform_config FOR SELECT\n  TO authenticated\n  USING (true);\n",
    "body": "LOCK TABLE ONLY public.platform_config IN ACCESS EXCLUSIVE MODE;\nDO $guard$\nBEGIN\n IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) OR EXISTS (SELECT 1 FROM ONLY public.platform_config) OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.platform_config'::regclass) THEN\n RAISE EXCEPTION 'security fixture requires privileged empty table without policies';\n END IF;\nEND\n$guard$;\nALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;\nCREATE POLICY \"authenticated_read_platform_config\"\n  ON public.platform_config FOR SELECT\n  TO authenticated\n  USING (true);\n",
    "table": "platform_config"
  }
];
export const SECURITY_FIXTURES=Object.freeze(SPECS.map(s=>Object.freeze(s.pin)));
export function extractSecurityFixture(step,source){
 const spec=SPECS.find(s=>s.pin.path===step.path);
 if(!spec) throw Error('Unknown security fixture');
 const lf=source.replace(/\r\n/g,'\n');
 if(sha256(lf)!==spec.pin.sourceLfSha256) throw Error('Security source SHA mismatch');
 const statements=spec.extracted.trim().split(';').filter(x=>x.trim()).map(x=>x.trim()+';');
 if(!statements.every(x=>lf.includes(x)) || sha256(spec.extracted)!==spec.pin.extractedLfSha256 || sha256(spec.body)!==spec.pin.lfSha256) throw Error('Security extraction SHA mismatch');
 return {extracted:spec.extracted,body:spec.body};
}
