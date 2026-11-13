import json,subprocess,unittest
from contextlib import ExitStack
from types import SimpleNamespace
from unittest.mock import patch
from workers.sales.claude_runtime import doctor
class AuthTests(unittest.TestCase):
 def check(self,auth,code=0):
  calls=[]
  def run(args,**kwargs):
   calls.append(args[1:])
   if args[1:]==['--version']:return subprocess.CompletedProcess(args,0,'2.1.296 (Claude Code)')
   if args[1:]==['--help']:return subprocess.CompletedProcess(args,0,'--safe-mode --tools --strict-mcp-config --no-session-persistence --permission-prompts')
   return subprocess.CompletedProcess(args,code,json.dumps(auth))
  def missing(*_):raise FileNotFoundError()
  fake=SimpleNamespace(HKEY_LOCAL_MACHINE=1,HKEY_CURRENT_USER=2,OpenKey=missing)
  with ExitStack() as s:
   s.enter_context(patch.dict('sys.modules',{'winreg':fake}));s.enter_context(patch('workers.sales.claude_runtime.shutil.which',return_value='claude.exe'));s.enter_context(patch('workers.sales.claude_runtime.runtime_environment',return_value={}));s.enter_context(patch('pathlib.Path.exists',return_value=False));s.enter_context(patch('workers.sales.claude_runtime.subprocess.run',side_effect=run));result=doctor()
  return result,calls
 def test_logged_out_installation_is_not_ready(self):
  r,calls=self.check({'loggedIn':False,'authMethod':'none'});self.assertFalse(r['ready']);self.assertIn(['auth','status','--json'],calls)
 def test_first_party_subscription_is_ready_without_inference(self):
  r,calls=self.check({'loggedIn':True,'authMethod':'claude.ai','apiProvider':'firstParty','subscriptionType':'pro','email':'PRIVATE_CANARY'});self.assertTrue(r['ready']);self.assertEqual(len(calls),3);self.assertNotIn('PRIVATE_CANARY',json.dumps(r))
 def test_unknown_provider_or_auth_failure_is_not_ready(self):
  for auth,code in [({'loggedIn':True,'authMethod':'api_key','apiProvider':'firstParty'},0),({'loggedIn':True,'authMethod':'claude.ai','apiProvider':'thirdParty'},0),({},1)]:
   with self.subTest(auth=auth):self.assertFalse(self.check(auth,code)[0]['ready'])
