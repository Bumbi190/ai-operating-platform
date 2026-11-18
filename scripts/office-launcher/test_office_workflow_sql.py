"""Disposable offline PostgreSQL and SQL -> HTTP contract integration.
No ports, network, real data, live grants or production workflow execution.
Optional OFFICE_WORKFLOW_RECEIVER imports the already-tested native pure receiver.
"""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import unittest
import uuid
ROOT = Path(__file__).resolve().parents[2]
BOOTSTRAP = "\nCREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;\nCREATE SCHEMA auth;\nCREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL);\nCREATE TABLE public.projects(id uuid PRIMARY KEY,owner_id uuid NOT NULL,name text,slug text);\nCREATE TABLE public.agents(id uuid PRIMARY KEY,project_id uuid,name text,system_prompt text);\nCREATE TABLE public.runs(id uuid PRIMARY KEY,project_id uuid,status text,claim_id uuid,claimed_at timestamptz,lease_until timestamptz,finished_at timestamptz,cancel_requested boolean,reconciliation_required boolean,steps_snapshot jsonb,created_at timestamptz,input text,workflow_id uuid,workflow_instance_id uuid,kind text);\nCREATE TABLE public.run_logs(id uuid PRIMARY KEY,run_id uuid,step_order integer,role text,created_at timestamptz,content text);\nINSERT INTO auth.sessions VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');\nINSERT INTO public.projects VALUES('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','Synthetic project','synthetic');\nINSERT INTO public.agents VALUES('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','Synthetic agent','SECRET_AGENT_PROMPT');\n"
PRIOR = """
CREATE FUNCTION public.test_visit(n bigint) RETURNS uuid LANGUAGE sql AS $$ SELECT (lpad(to_hex(floor(extract(epoch FROM clock_timestamp())*1000)::bigint),12,'0')||'70008000'||lpad(to_hex(n),12,'0'))::uuid; $$;
CREATE TABLE public.fixture_ids(id uuid);
INSERT INTO public.fixture_ids SELECT public.test_visit(1);
SELECT public.office_visit_create('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',(SELECT id FROM public.fixture_ids),repeat('a',64),'22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','office-familje-pling');
"""
class WorkflowSQL(unittest.TestCase):
    def test_scopes_census_contract_and_revocation(self):
        name = 'omnira-office-workflow-' + uuid.uuid4().hex[:12]
        def docker(*args, sql=None):
            return subprocess.run(['docker', *args], input=sql, text=True, capture_output=True, timeout=45)
        def psql(sql):
            r = docker('exec','-i',name,'psql','-X','-qAt','-U','postgres','-v','ON_ERROR_STOP=1',sql=sql)
            self.assertEqual(r.returncode,0,r.stdout[-3000:]+r.stderr[-3000:])
            return r.stdout.strip()
        r=docker('run','--rm','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine')
        self.assertEqual(r.returncode,0,r.stderr)
        receiver = None
        if os.environ.get('OFFICE_WORKFLOW_RECEIVER'):
            path=Path(os.environ['OFFICE_WORKFLOW_RECEIVER'])
            spec=importlib.util.spec_from_file_location('workflow_receiver_fixture',path)
            module=importlib.util.module_from_spec(spec);sys.modules[spec.name]=module;spec.loader.exec_module(module)
            print('native_receiver_sha256='+hashlib.sha256(path.read_bytes()).hexdigest())
        else: module=None
        try:
            for _ in range(80):
                logs=docker('logs',name)
                if 'PostgreSQL init process complete; ready for start up.' in logs.stdout+logs.stderr and docker('exec',name,'pg_isready','-U','postgres').returncode==0: break
                time.sleep(.25)
            migrations=ROOT/'apps/web/supabase/migrations'
            visit=next(migrations.glob('*_office_visit_sessions.sql')).read_text('utf-8')
            activity=next(migrations.glob('*_office_step_activity.sql')).read_text('utf-8')
            workflow=next(migrations.glob('*_office_workflow_state.sql')).read_text('utf-8')
            checks=Path(__file__).with_name('office_workflow_fixture.sql').read_text('utf-8')
            psql(BOOTSTRAP+visit+PRIOR+activity+workflow+checks)
            # Use an actual synthetic database visit, fresh SQL timestamps/revision,
            # HTTP response validation, then the existing native pure receiver.
            sequence=[('idle',''),('busy',"INSERT INTO public.runs(id,project_id,status,claim_id,claimed_at,lease_until,finished_at,cancel_requested,reconciliation_required,steps_snapshot,created_at,input) VALUES('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','pending',NULL,NULL,NULL,NULL,false,false,'[{\"order\":0,\"agent_id\":\"33333333-3333-4333-8333-333333333333\"}]',clock_timestamp(),'SECRET_INPUT');"),('busy',"UPDATE public.runs SET status='running',claim_id='55555555-5555-4555-8555-555555555555',claimed_at=clock_timestamp()-interval '1 second',lease_until=clock_timestamp()+interval '8 seconds';"),('unknown',"UPDATE public.runs SET lease_until=clock_timestamp()-interval '1 second';"),('unknown',"UPDATE public.runs SET status='done',finished_at=NULL;"),('idle',"UPDATE public.runs SET status='done',finished_at=clock_timestamp()-interval '1 second';")]
            # Prove the actual trusted role can invoke the definer and lower roles cannot.
            visit=psql('SELECT id FROM public.workflow_fixture;')
            self.assertIsInstance(json.loads(psql("SET ROLE service_role; SELECT public.office_visit_workflow_presence('"+visit+"',repeat('b',64));")),dict)
            for role in ('anon','authenticated'):
                denied=docker('exec','-i',name,'psql','-X','-qAt','-U','postgres','-v','ON_ERROR_STOP=1',sql="SET ROLE "+role+"; SELECT public.office_visit_workflow_presence('"+visit+"',repeat('b',64));")
                self.assertNotEqual(denied.returncode,0)
                self.assertIn('permission denied',denied.stderr)
            with ThreadPoolExecutor(max_workers=6) as pool:
                concurrent=list(pool.map(lambda _: json.loads(psql("SELECT public.office_visit_workflow_presence('"+visit+"',repeat('b',64));"))['workflowRevision'],range(6)))
            self.assertEqual(len(set(concurrent)),6)
            self.assertEqual(max(concurrent)-min(concurrent),5)
            revisions=[]
            for expected,mutation in sequence:
                raw=json.loads(psql(mutation+"SELECT public.office_visit_workflow_presence((SELECT id FROM public.workflow_fixture),repeat('b',64));"))
                result=subprocess.run(['node',str(Path(__file__).with_name('workflow_sql_projection.cjs'))],input=json.dumps(raw),text=True,capture_output=True,timeout=20)
                self.assertEqual(result.returncode,0,result.stderr)
                data=json.loads(result.stdout)
                self.assertEqual(data['workflow_state'],expected)
                self.assertNotIn('SECRET_',result.stdout)
                self.assertEqual(data['execution'],'not_verified')
                revisions.append(data['revision'])
                if module:
                    if receiver is None: receiver=module.WorkflowStateReceiver(module.Binding(**{k:data[k] for k in ('visit_id','avatar_id','project_id','agent_id')}),enabled=True)
                    wall=time.time();mono=time.monotonic()
                    actual=receiver.accept_authorized(data,wall=wall,mono=mono)
                    self.assertEqual(actual.state,expected)
                    self.assertEqual(actual.workflow_busy,expected!='idle')
                    self.assertEqual(actual.workflow_state_known,expected!='unknown')
            self.assertEqual(revisions,sorted(set(revisions)))
            if receiver:
                projected=receiver.view(wall=data['expires_at_unix']+1,mono=mono+21)
                self.assertFalse(projected.workflow_state_known)
                self.assertTrue(projected.workflow_busy)
            psql("DO $$ DECLARE v uuid:=(SELECT id FROM public.workflow_fixture); BEGIN PERFORM public.office_visit_revoke(v,repeat('b',64),NULL,NULL); PERFORM public.assert_ok(public.office_visit_workflow_presence(v,repeat('b',64)) IS NULL,'revocation ignored'); END $$;")
            print('workflow_sql_fixture_and_http_scenarios=6; native_receiver='+str(module is not None))
        finally:
            self.assertEqual(docker('rm','-f',name).returncode,0,'Owned fixture cleanup failed')
if __name__ == '__main__': unittest.main()
