"""Disposable, network-isolated PostgreSQL fixture. Synthetic identities only."""
import pathlib
import subprocess
import time
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parents[2]


class VisitSQL(unittest.TestCase):
    def test_atomic_authorization_and_catalog(self):
        files = list((ROOT / 'apps/web/supabase/migrations').glob('*_office_visit_sessions.sql'))
        self.assertEqual(len(files), 1, 'Office visit migration missing')
        name = 'omnira-office-visit-fixture-' + uuid.uuid4().hex[:12]
        def docker(*args, sql=None):
            return subprocess.run(['docker', *args], input=sql, text=True,
                                  capture_output=True, timeout=45)
        started = docker('run', '--rm', '-d', '--name', name, '--network', 'none',
                         '--tmpfs', '/var/lib/postgresql/data', '-e',
                         'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16')
        self.assertEqual(started.returncode, 0, started.stderr)
        try:
            for _ in range(80):
                if docker('exec', name, 'pg_isready', '-U', 'postgres').returncode == 0:
                    break
                time.sleep(.25)
            bootstrap = """
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL);
CREATE TABLE public.projects(id uuid PRIMARY KEY,owner_id uuid NOT NULL,name text,slug text);
CREATE TABLE public.agents(id uuid PRIMARY KEY,project_id uuid,name text,system_prompt text);
INSERT INTO auth.sessions VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');
INSERT INTO public.projects VALUES ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','Synthetic project','synthetic');
INSERT INTO public.agents VALUES ('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','Synthetic agent','SECRET PROMPT MUST NOT LEAVE DB');
"""
            checks = (pathlib.Path(__file__).with_name('office_visit_fixture.sql')).read_text('utf-8')
            result = docker('exec', '-i', name, 'psql', '-X', '-U', 'postgres',
                            '-v', 'ON_ERROR_STOP=1', sql=bootstrap + files[0].read_text('utf-8') + checks)
            self.assertEqual(result.returncode, 0, result.stdout[-3000:] + result.stderr[-3000:])
            def concurrent_create(n):
                query="""SELECT public.office_visit_create(
 '11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 (lpad(to_hex(floor(extract(epoch FROM clock_timestamp())*1000)::bigint),12,'0')||'70008000'||lpad(to_hex(%d),12,'0'))::uuid,repeat('a',64),
 '22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','office-familje-pling') IS NOT NULL;""" % n
                return docker('exec','-i',name,'psql','-X','-At','-U','postgres','-v','ON_ERROR_STOP=1',sql=query)
            with ThreadPoolExecutor(2) as pool:
                for response in pool.map(concurrent_create,[1001,1002]):
                    self.assertEqual(response.returncode,0,response.stderr)
                    self.assertEqual(response.stdout.strip(),'t')
            state=docker('exec','-i',name,'psql','-X','-At','-U','postgres',sql='SELECT count(*) FROM office_private.visits WHERE revoked_at IS NULL;')
            self.assertEqual(state.stdout.strip(),'1','Concurrent create must leave one current grant')
        finally:
            removed = docker('rm', '-f', name)
            self.assertEqual(removed.returncode, 0, 'Owned disposable fixture cleanup failed')


if __name__ == '__main__':
    unittest.main()
