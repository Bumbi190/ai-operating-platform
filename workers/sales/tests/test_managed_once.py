"""Managed CLI regression tests: real journal/lock/transport, synthetic boundaries."""
import hashlib
import io
import json
import os
import subprocess
import tempfile
import unittest
from contextlib import ExitStack,redirect_stdout
from datetime import datetime,timedelta,timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock,patch

from workers.sales import cli,host
from workers.sales.credential_store import connection_key
from workers.sales.journal import Journal,JournalError,SingleInstance
from workers.sales.managed_connection import ConnectionUnavailable

PROJECT='10000000-0000-4000-8000-000000000001'
WORKER='60000000-0000-4000-8000-000000000001'

class ManagedOnceTests(unittest.TestCase):
 def setUp(self):
  tmp=tempfile.TemporaryDirectory();self.addCleanup(tmp.cleanup);self.root=Path(tmp.name)
  self.installation=self.root/'installation';self.source=self.installation/'workers/sales/host.py'
  self.source.parent.mkdir(parents=True);self.source.write_bytes(b'synthetic pinned source')
  manifest={'sourceSha':'a'*40,'files':{'workers/sales/host.py':hashlib.sha256(self.source.read_bytes()).hexdigest()}}
  raw=json.dumps(manifest).encode();(self.installation/'installation-manifest.json').write_bytes(raw)
  self.base=self.root/'appdata/OmniraSales/connections';self.base.mkdir(parents=True)
  self.state=self.base/PROJECT;self.state.mkdir()
  self.config={'origin':'https://preview.example.invalid','projectId':PROJECT,'workerId':WORKER,
   'installationRoot':str(self.installation),'manifestSha256':hashlib.sha256(raw).hexdigest(),
   'transport':'vercel_preview','node':'synthetic-node','vercelCli':'synthetic-vercel','scope':'fixture',
   'activeRef':'obsolete-bootstrap-ref','generation':1,'expiresAt':'2000-01-01T00:00:00Z',
   'mailboxEnabled':True,'replyEnabled':True,'sendEnabled':True}
  self.save_config()
  self.expiry=(datetime.now(timezone.utc)+timedelta(hours=24)).isoformat()
  Journal(self.state/'connection.json').save({'version':1,'origin':self.config['origin'],
   'projectId':PROJECT,'workerId':WORKER,'adopted':True,'pending':None,'generation':6,
   'expiresAt':self.expiry,'managerRef':'manager-ref','activeRef':'current-journal-ref'})
  self.store=Mock();self.store.read.side_effect=lambda name:{'manager-ref':'M'*43,'current-journal-ref':'W'*43}[name]
  self.status={'generation':6,'workerExpiresAt':self.expiry,'desiredState':'running','executionPaused':False,'reconnectRequested':False}
  self.requests=[];self.model_calls=[];self.empty=False;self.fail_complete=False;self.model_error=None
  self.ref={'projectId':PROJECT,'workerId':WORKER,'jobId':'job','claimId':'claim','generation':1}
  self.runtime=SimpleNamespace(readiness={'ready':True});self.adapter=Mock();self.adapter.prepare.side_effect=self.prepare
  stack=ExitStack();self.addCleanup(stack.close)
  stack.enter_context(patch.dict(os.environ,{'LOCALAPPDATA':str(self.root/'appdata')}))
  stack.enter_context(patch.object(host,'__file__',str(self.source)))
  self.store_factory=stack.enter_context(patch.object(host,'CredentialStore',return_value=self.store))
  self.runtime_factory=stack.enter_context(patch.object(host,'SafeClaudeTextRuntime',return_value=self.runtime))
  self.adapter_factory=stack.enter_context(patch.object(host,'HarveyDraftAdapter',return_value=self.adapter))
  stack.enter_context(patch('workers.sales.preview_transport.subprocess.run',side_effect=self.preview_request))
  self.legacy_runtime=stack.enter_context(patch.object(cli,'SafeClaudeTextRuntime',side_effect=AssertionError('LEGACY_RUNTIME_USED')))
  self.legacy_store=stack.enter_context(patch.object(cli,'CredentialStore',side_effect=AssertionError('LEGACY_STORE_USED')))
  self.legacy_client=stack.enter_context(patch.object(cli,'SalesProtocolClient',side_effect=AssertionError('LEGACY_TRANSPORT_USED')))

 def save_config(self):
  (self.base/(PROJECT+'.json')).write_text(json.dumps(self.config),encoding='utf-8')

 def preview_request(self,args,**kwargs):
  lines=kwargs['input'].decode().splitlines()
  body=json.loads(json.loads(next(x.split(' = ',1)[1] for x in lines if x.startswith('data-binary = '))))
  authorization=next(json.loads(x.split(' = ',1)[1]) for x in lines if x.startswith('header = ') and 'Authorization:' in x)
  path=args[3];operation=body['operation'];self.requests.append((path,operation,body))
  self.assertEqual(kwargs['cwd'],str(self.installation));self.assertEqual(args[args.index('--deployment')+1],self.config['origin'])
  if path=='/api/sales/host':
   self.assertEqual(authorization,'Authorization: Bearer '+'M'*43)
   self.assertIn(operation,('poll','report_status'));response=self.status if operation=='poll' else {'ok':True}
  else:
   self.assertEqual(path,'/api/sales/worker');self.assertEqual(authorization,'Authorization: Bearer '+'W'*43)
   if operation=='claim':response={'ref':None} if self.empty else {'ref':self.ref,'snapshot':{'contacts':[{'id':'contact','websiteUrl':None}],'offer':{'id':'offer'}}}
   elif operation=='reserve_attempt':response={'attemptId':body['attemptId'],'dispatchBefore':self.expiry}
   elif operation=='complete' and self.fail_complete:return subprocess.CompletedProcess(args,1,b'')
   else:
    self.assertIn(operation,('commit_research','complete','report_failure','heartbeat'));response={}
  return subprocess.CompletedProcess(args,0,json.dumps(response).encode())

 def prepare(self,*args):
  guard=Journal(self.state/'dispatch.json').load()
  self.assertTrue(guard['inFlight']);self.assertEqual(guard['jobId'],'job');self.assertTrue(guard['attemptId'])
  self.model_calls.append(args)
  if self.model_error:raise self.model_error
  return {'questions':[]}

 def run_cli(self,*extra):
  output=io.StringIO()
  with redirect_stdout(output):code=cli.main(['run','--project',PROJECT,*extra])
  return code,json.loads(output.getvalue())

 def assert_no_work(self):
  self.runtime_factory.assert_not_called();self.adapter_factory.assert_not_called()
  self.assertFalse(any(path=='/api/sales/worker' for path,_,_ in self.requests));self.assertEqual(self.model_calls,[])

 def test_preview_once_uses_current_journal_identity_and_never_starts_mail_loops(self):
  with patch.object(host,'main',side_effect=AssertionError('HOST_STARTED')),patch.object(host,'host_loop',side_effect=AssertionError('HOST_LOOP_STARTED')),patch.object(host,'inbox_background',side_effect=AssertionError('INBOX_STARTED')),patch.object(host,'send_background',side_effect=AssertionError('SEND_STARTED')):
   code,result=self.run_cli('--once','--model','fixture-model')
  self.assertEqual(code,0);self.assertEqual(result,{'worked':True,'sendingEnabled':False})
  self.runtime_factory.assert_called_once_with('fixture-model');self.assertEqual(len(self.model_calls),1)
  self.assertEqual([op for path,op,_ in self.requests if path=='/api/sales/worker'],['claim','commit_research','reserve_attempt','complete'])
  self.assertEqual({call.args[0] for call in self.store.read.call_args_list},{'manager-ref','current-journal-ref'})
  self.store.write.assert_not_called();self.store.delete.assert_not_called()
  self.assertEqual(Journal(self.state/'dispatch.json').load(),{'inFlight':False})

 def test_empty_queue_does_not_create_an_uncertain_dispatch(self):
  self.empty=True;code,result=self.run_cli('--once')
  self.assertEqual(code,1);self.assertFalse(result['worked']);self.assertEqual(self.model_calls,[])
  self.assertFalse((self.state/'dispatch.json').exists())
  self.assertEqual([op for path,op,_ in self.requests if path=='/api/sales/worker'],['claim'])

 def test_managed_continuous_run_is_refused_before_credentials_or_readiness(self):
  code,result=self.run_cli()
  self.assertEqual(code,1);self.assertEqual(result['reason'],'MANAGED_RUN_REQUIRES_ONCE')
  self.store_factory.assert_not_called();self.assertEqual(self.requests,[]);self.assert_no_work()

 def test_partial_managed_config_never_falls_back_to_legacy(self):
  for marker in ('installationRoot','manifestSha256','activeRef','generation','expiresAt','transport'):
   with self.subTest(marker=marker):
    self.config={'origin':'https://preview.example.invalid','projectId':PROJECT,'workerId':WORKER,marker:'incomplete'};self.save_config()
    code,result=self.run_cli();self.assertEqual(result['reason'],'MANAGED_RUN_REQUIRES_ONCE')
    with self.assertRaises((KeyError,host.HostBlocked)):self.run_cli('--once')
  self.legacy_store.assert_not_called();self.legacy_client.assert_not_called();self.assertEqual(self.requests,[]);self.assert_no_work()

 def test_busy_host_lock_prevents_token_refresh_and_readiness(self):
  with SingleInstance(self.state/'host.lock'):
   with self.assertRaises(JournalError):self.run_cli('--once')
  self.store.read.assert_not_called();self.assertEqual(self.requests,[]);self.assert_no_work()

 def test_wrong_launch_root_is_refused_before_credentials(self):
  self.config['installationRoot']=str(self.root/'different');self.save_config()
  with self.assertRaises(host.HostBlocked):self.run_cli('--once')
  self.store_factory.assert_not_called();self.assertEqual(self.requests,[]);self.assert_no_work()

 def test_modified_source_is_refused_before_credentials(self):
  self.source.write_bytes(b'changed source')
  with self.assertRaises(host.HostBlocked):self.run_cli('--once')
  self.store_factory.assert_not_called();self.assertEqual(self.requests,[]);self.assert_no_work()

 def test_manifest_pin_mismatch_is_refused_before_credentials(self):
  self.config['manifestSha256']='0'*64;self.save_config()
  with self.assertRaises(host.HostBlocked):self.run_cli('--once')
  self.store_factory.assert_not_called();self.assertEqual(self.requests,[]);self.assert_no_work()

 def test_wrong_connection_journal_identity_is_refused_before_network(self):
  journal=Journal(self.state/'connection.json');state=journal.load();state['workerId']='other-worker';journal.save(state)
  with self.assertRaises(ConnectionUnavailable):self.run_cli('--once')
  self.store.read.assert_not_called();self.assertEqual(self.requests,[]);self.assert_no_work()

 def test_uncertain_initial_or_reply_dispatch_blocks_before_network(self):
  for filename,value,reason in [('dispatch.json',{'inFlight':True},'DISPATCH_RECONCILIATION_REQUIRED'),('reply-dispatch.json',{'pending':{'attemptId':'old'}},'REPLY_RECONCILIATION_REQUIRED')]:
   with self.subTest(filename=filename):
    journal=Journal(self.state/filename);journal.save(value);self.config['replyEnabled']=False;self.save_config()
    code,result=self.run_cli('--once');self.assertEqual(code,1);self.assertEqual(result['reason'],reason)
    self.assertEqual(journal.load(),value);journal.path.unlink()
  self.store.read.assert_not_called();self.assertEqual(self.requests,[]);self.assert_no_work()

 def test_invalid_dispatch_journal_is_refused_before_network(self):
  for filename in ('dispatch.json','reply-dispatch.json'):
   with self.subTest(filename=filename):
    path=self.state/filename;path.write_text('[]',encoding='utf-8')
    with self.assertRaises(JournalError):self.run_cli('--once')
    path.unlink()
  self.store.read.assert_not_called();self.assertEqual(self.requests,[]);self.assert_no_work()

 def test_paused_stopped_or_unknown_execution_state_never_claims(self):
  for desired,paused in [('paused',False),('stopped',False),('running',True),('running',None),(None,False)]:
   with self.subTest(desired=desired,paused=paused):
    self.status.update(desiredState=desired,executionPaused=paused)
    code,result=self.run_cli('--once');self.assertEqual(code,1);self.assertEqual(result['reason'],'HOST_EXECUTION_DISABLED')
  self.assert_no_work()

 def test_failed_readiness_reports_blocked_without_claiming(self):
  self.runtime.readiness={'ready':False,'reason':'CLAUDE_AUTH_REQUIRED'}
  code,result=self.run_cli('--once');self.assertEqual(code,1);self.assertEqual(result['reason'],'CLAUDE_AUTH_REQUIRED')
  self.adapter_factory.assert_not_called();self.assertEqual(self.model_calls,[])
  self.assertFalse(any(path=='/api/sales/worker' for path,_,_ in self.requests))
  self.assertEqual(self.requests[-1][2]['cliState'],'blocked')

 def test_lost_completion_keeps_dispatch_and_a_second_run_does_not_retry(self):
  self.fail_complete=True;code,result=self.run_cli('--once')
  self.assertEqual(code,1);self.assertEqual(result['reason'],'DISPATCH_RECONCILIATION_REQUIRED')
  guard=Journal(self.state/'dispatch.json').load();count=len(self.requests)
  self.run_cli('--once');self.assertEqual(len(self.requests),count);self.assertEqual(len(self.model_calls),1)
  self.assertEqual(Journal(self.state/'dispatch.json').load(),guard)

 def test_model_timeout_keeps_dispatch_and_is_not_retried(self):
  self.model_error=TimeoutError('synthetic timeout');code,result=self.run_cli('--once')
  self.assertEqual(code,1);self.assertEqual(result['reason'],'DISPATCH_RECONCILIATION_REQUIRED')
  self.assertEqual(len(self.model_calls),1);self.assertTrue(Journal(self.state/'dispatch.json').load()['inFlight'])
  self.assertEqual(self.requests[-1][1],'report_failure')

 def test_interruption_after_dispatch_keeps_guard_and_releases_host_lock(self):
  self.model_error=KeyboardInterrupt()
  with self.assertRaises(KeyboardInterrupt):self.run_cli('--once')
  self.assertTrue(Journal(self.state/'dispatch.json').load()['inFlight'])
  with SingleInstance(self.state/'host.lock'):pass

class LegacyRunTests(unittest.TestCase):
 def test_legacy_once_retains_the_original_credential_and_direct_transport(self):
  with tempfile.TemporaryDirectory() as directory,ExitStack() as stack:
   base=Path(directory)/'OmniraSales/connections';base.mkdir(parents=True)
   config={'origin':'https://legacy.example.invalid','projectId':PROJECT,'workerId':WORKER}
   (base/(PROJECT+'.json')).write_text(json.dumps(config),encoding='utf-8')
   stack.enter_context(patch.dict(os.environ,{'LOCALAPPDATA':directory}))
   runtime=stack.enter_context(patch.object(cli,'SafeClaudeTextRuntime',return_value=SimpleNamespace(readiness={'ready':True})))
   store=Mock();store.read.return_value='L'*43;stack.enter_context(patch.object(cli,'CredentialStore',return_value=store))
   client=stack.enter_context(patch.object(cli,'SalesProtocolClient'));adapter=stack.enter_context(patch.object(cli,'HarveyDraftAdapter'))
   work=stack.enter_context(patch.object(cli,'run_once',return_value=True))
   managed=stack.enter_context(patch.object(host,'run_managed_once',side_effect=AssertionError('MANAGED_USED')))
   with redirect_stdout(io.StringIO()):self.assertEqual(cli.main(['run','--project',PROJECT,'--once']),0)
   store.read.assert_called_once_with(connection_key(config['origin'],PROJECT))
   client.assert_called_once_with(config['origin'],'L'*43);work.assert_called_once_with(client.return_value,adapter.return_value)
   runtime.assert_called_once_with('');managed.assert_not_called()

if __name__=='__main__':unittest.main()
