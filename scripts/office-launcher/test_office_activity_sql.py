"""Owned disposable PostgreSQL; no ports, no real credentials or project data."""
import json
from pathlib import Path
import subprocess
import time
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[2]

class ActivitySQL(unittest.TestCase):
    def test_scopes_facts_and_privileges(self):
        old = list((ROOT/'apps/web/supabase/migrations').glob('*_office_visit_sessions.sql'))
        new = list((ROOT/'apps/web/supabase/migrations').glob('*_office_step_activity.sql'))
        self.assertEqual(len(new), 1, 'Activity follow-up migration missing')
        self.assertEqual(len(old), 1)
        name = 'omnira-office-activity-' + uuid.uuid4().hex[:12]
        def docker(*args, sql=None):
            return subprocess.run(['docker', *args], input=sql, text=True, capture_output=True, timeout=45)
        result = docker('run', '--rm', '-d', '--name', name, '--network', 'none', '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17-alpine')
        self.assertEqual(result.returncode, 0, result.stderr)
        try:
            for _ in range(80):
                logs=docker('logs', name)
                if 'PostgreSQL init process complete; ready for start up.' in logs.stdout+logs.stderr and docker('exec', name, 'pg_isready', '-U', 'postgres').returncode == 0: break
                time.sleep(.25)
            bootstrap = """
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL);
CREATE TABLE public.projects(id uuid PRIMARY KEY,owner_id uuid NOT NULL,name text,slug text);
CREATE TABLE public.agents(id uuid PRIMARY KEY,project_id uuid,name text,system_prompt text);
CREATE TABLE public.runs(id uuid PRIMARY KEY,project_id uuid,status text,claim_id uuid,claimed_at timestamptz,lease_until timestamptz,finished_at timestamptz,cancel_requested boolean,reconciliation_required boolean,steps_snapshot jsonb,created_at timestamptz,input text);
CREATE TABLE public.run_logs(id uuid PRIMARY KEY,run_id uuid,step_order integer,role text,created_at timestamptz,content text);
INSERT INTO auth.sessions VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');
INSERT INTO public.projects VALUES('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','Synthetic project','synthetic');
INSERT INTO public.agents VALUES('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','Synthetic agent','SECRET_AGENT_PROMPT');
"""
            # Create an actual pre-upgrade grant before ALTER TABLE.
            prior = """
CREATE FUNCTION public.test_visit(n bigint) RETURNS uuid LANGUAGE sql AS $$ SELECT (lpad(to_hex(floor(extract(epoch FROM clock_timestamp())*1000)::bigint),12,'0')||'70008000'||lpad(to_hex(n),12,'0'))::uuid; $$;
CREATE TABLE public.fixture_ids(id uuid);
INSERT INTO public.fixture_ids SELECT public.test_visit(1);
SELECT public.office_visit_create('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',(SELECT id FROM public.fixture_ids),repeat('a',64),'22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','office-familje-pling');
"""
            checks = Path(__file__).with_name('office_activity_fixture.sql').read_text('utf-8')
            started = time.monotonic()
            result = docker('exec', '-i', name, 'psql', '-X', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', sql=bootstrap+old[0].read_text('utf-8')+prior+new[0].read_text('utf-8')+checks)
            self.assertEqual(result.returncode, 0, result.stdout[-5000:]+result.stderr[-5000:])
            print('activity_sql_fixture_seconds='+str(round(time.monotonic()-started,3)))
        finally:
            self.assertEqual(docker('rm', '-f', name).returncode, 0, 'Owned fixture cleanup failed')

if __name__ == '__main__': unittest.main()
