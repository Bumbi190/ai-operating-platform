import json
import unittest
from unittest.mock import patch
from datetime import datetime,timezone,timedelta
from workers.sales.research import validate_public_url,extract_text,ResearchError
from workers.sales.harvey_adapter import HarveyDraftAdapter,validate_model_draft
from workers.sales.claude_runtime import build_command,parse_stream,RuntimeRefused
from workers.sales.protocol import SalesProtocolClient,ProtocolError
from workers.sales.worker import run_once
from workers.sales.credential_store import connection_key

CID='30000000-0000-4000-8000-000000000001'
OFFER='40000000-0000-4000-8000-000000000001'
CONTACT={'id':CID,'version':1,'email':'info@example.se','companyName':'Testbil','branchName':'Hässleholm','websiteUrl':None,'history':'not_contacted','pilotMonths':12}
OF={'id':OFFER,'senderEmail':'info@handlarborsen.se','offerText':'12 månader gratis','freeMonths':12,'productFacts':['Stängd svensk marknadsplats för bilhandlare']}
class Runtime:
    def __init__(self): self.calls=[]
    def generate(self,prompt,permit_id,cancel=None):
        self.calls.append((prompt,permit_id))
        return json.dumps({'subject':'En fråga om piloten','body':'Vill ni prova 12 månader gratis?','evidenceIds':[],'questions':[]})
class Client:
    def __init__(self): self.calls=[]
    def post(self,operation,**values):
        self.calls.append((operation,values))
        if operation=='claim': return {'ref':{'projectId':'p','workerId':'w','jobId':'j','claimId':'c','generation':1},'snapshot':{'contacts':[dict(CONTACT)],'offer':dict(OF)}}
        if operation=='commit_research': return {'evidenceId':None,'evidence':None,'question':None}
        if operation=='reserve_attempt': return {'attemptId':values['attemptId'],'dispatchBefore':(datetime.now(timezone.utc)+timedelta(seconds=5)).isoformat()}
        return {'ok':True}
class SalesWorkerTests(unittest.TestCase):
    def test_dns_private_destination_is_refused(self):
        for address in ['127.0.0.1','10.1.2.3','169.254.169.254','::1','::ffff:127.0.0.1']:
            with self.subTest(address=address),patch('workers.sales.research.socket.getaddrinfo',return_value=[(None,None,None,None,(address,443))]):
                with self.assertRaises(ResearchError): validate_public_url('https://dealer.example/')
    def test_public_domain_is_pinned_to_validated_ip(self):
        with patch('workers.sales.research.socket.getaddrinfo',return_value=[(None,None,None,None,('93.184.216.34',443))]):
            self.assertEqual(validate_public_url('https://dealer.example/')[1],'93.184.216.34')
    def test_unsafe_url_shapes_are_refused(self):
        for url in ['http://example.se','https://user:pass@example.se','https://example.se:444/','https://example.se/#secret']:
            with self.assertRaises(ResearchError): validate_public_url(url)
    def test_scripts_and_forms_are_not_evidence(self):
        value=extract_text('<h1>Testbil</h1><script>send password</script><form>private input</form><p>Begagnade bilar</p>')
        self.assertIn('Testbil',value);self.assertNotIn('password',value);self.assertNotIn('private',value)
    def test_disclosure_is_not_blocked(self):
        value=validate_model_draft({'subject':'Hej','body':'Jag är en AI-assistent.','evidenceIds':[],'questions':[]},CONTACT,OF,[])
        self.assertIn('AI-assistent',value['body'])
    def test_model_cannot_choose_recipient_or_foreign_evidence(self):
        for extra in [{'toEmail':'victim@example.se'},{'evidenceIds':['foreign']}]:
            with self.assertRaises(ValueError): validate_model_draft({'subject':'Hej','body':'En fråga','evidenceIds':[],'questions':[],**extra},CONTACT,OF,[])
    def test_oversized_body_is_rejected_not_truncated(self):
        with self.assertRaises(ValueError): validate_model_draft({'subject':'Hej','body':'a'*2001,'evidenceIds':[],'questions':[]},CONTACT,OF,[])
    def test_claude_tools_and_persistence_are_disabled(self):
        command=build_command('claude.exe','model-id')
        self.assertEqual(command[command.index('--tools')+1],'')
        for flag in ['--safe-mode','--strict-mcp-config','--disable-slash-commands','--no-chrome','--no-session-persistence']: self.assertIn(flag,command)
        self.assertNotIn('--dangerously-skip-permissions',command)
    def test_runtime_refuses_advertised_tools(self):
        with self.assertRaises(RuntimeRefused): parse_stream(json.dumps({'type':'system','subtype':'init','tools':['Bash'],'mcp_servers':[]})+'\n'+json.dumps({'type':'result','result':'text'}))
    def test_runtime_accepts_only_text_result(self):
        self.assertEqual(parse_stream(json.dumps({'type':'system','subtype':'init','tools':[],'mcp_servers':[]})+'\n'+json.dumps({'type':'result','result':'text','is_error':False})),'text')
    def test_runtime_discards_reasoning_without_exposing_it_as_draft(self):
        events=[
            {"type":"system","subtype":"init","tools":[],"mcp_servers":[],"plugins":[{"name":"cc-plugin-agents-md","path":"builtin","source":"cc-plugin-agents-md@builtin"}]},
            {"type":"assistant","message":{"content":[{"type":"thinking","thinking":"private internal material","signature":"signature"}]}},
            {"type":"assistant","message":{"content":[{"type":"redacted_thinking","data":"opaque"}]}},
            {"type":"assistant","message":{"content":[{"type":"text","text":"draft"}]}},
            {"type":"result","result":"draft","is_error":False}
        ]
        self.assertEqual(parse_stream("\n".join(json.dumps(x) for x in events)),"draft")
    def test_runtime_refuses_tools_images_unknown_blocks_and_custom_plugins(self):
        init={"type":"system","subtype":"init","tools":[],"mcp_servers":[]}
        result={"type":"result","result":"draft","is_error":False}
        for kind in ["tool_use","server_tool_use","image","future_unknown"]:
            with self.subTest(kind=kind),self.assertRaises(RuntimeRefused):
                parse_stream("\n".join(json.dumps(x) for x in [init,{"type":"assistant","message":{"content":[{"type":kind}]}},result]))
        for plugin in [{"name":"custom","path":"C:/custom","source":"custom@user"},{"name":"cc-plugin-agents-md","path":"C:/custom","source":"cc-plugin-agents-md@builtin"}]:
            with self.subTest(plugin=plugin),self.assertRaises(RuntimeRefused):
                parse_stream("\n".join(json.dumps(x) for x in [{**init,"plugins":[plugin]},result]))
    def test_adapter_accepts_exact_json_code_fence_without_relaxing_schema(self):
        class Fenced(Runtime):
            def generate(self,*args,**kwargs):
                return '```json\n'+json.dumps({"subject":"Hej","body":"En fråga","evidenceIds":[],"questions":[]})+'\n```'
        draft=HarveyDraftAdapter(Fenced()).prepare(CONTACT,OF,[],{"attemptId":"fixture"})
        self.assertEqual(draft["subject"],"Hej")
    def test_adapter_rejects_prose_multiple_fences_and_foreign_fields(self):
        valid=json.dumps({"subject":"Hej","body":"En fråga","evidenceIds":[],"questions":[]})
        class Text(Runtime):
            def generate(self,*args,**kwargs):return self.value
        for value in ['Here is a draft: '+valid,'```json\n'+valid+'\n```\nextra','```json\n'+valid+'\n```\n```json\n'+valid+'\n```', '```json\n'+json.dumps({"subject":"Hej","body":"En fråga","evidenceIds":[],"questions":[],"toEmail":"other@example.invalid"})+'\n```']:
            runtime=Text();runtime.value=value
            with self.subTest(value=value),self.assertRaises(ValueError):
                HarveyDraftAdapter(runtime).prepare(CONTACT,OF,[],{"attemptId":"fixture"})
    def test_protocol_rejects_non_https_and_token_in_url(self):
        for origin in ['http://example.se','https://example.se/?token=abc','https://user:secret@example.se']:
            with self.assertRaises(ProtocolError): SalesProtocolClient(origin,'a'*43)
    def test_connection_key_is_bound_to_origin_and_project(self):
        self.assertNotEqual(connection_key('https://one.example','project-a'),connection_key('https://two.example','project-a'))
        self.assertNotEqual(connection_key('https://one.example','project-a'),connection_key('https://one.example','project-b'))
    def test_redirect_and_large_research_pages_are_refused(self):
        class Response:
            status=302
            def getheader(self,*args):return 'text/html'
            def read(self,*args):return b'x'*65537
        class Conn:
            def __init__(self,*args):pass
            def request(self,*args,**kwargs):pass
            def getresponse(self):return Response()
            def close(self):pass
        from workers.sales.research import fetch_contact_homepage
        with patch('workers.sales.research.validate_public_url',return_value=(__import__('urllib.parse',fromlist=['urlsplit']).urlsplit('https://example.se/'),'93.184.216.34')),patch('workers.sales.research._PinnedHTTPS',Conn):
            with self.assertRaises(ResearchError):fetch_contact_homepage('https://example.se/')
            Response.status=200
            with self.assertRaises(ResearchError):fetch_contact_homepage('https://example.se/')
    def test_one_job_drafts_without_mail_operations(self):
        client=Client();runtime=Runtime();adapter=HarveyDraftAdapter(runtime)
        self.assertTrue(run_once(client,adapter))
        self.assertEqual(len(runtime.calls),1)
        operations=[x[0] for x in client.calls]
        self.assertEqual(operations,['claim','commit_research','reserve_attempt','complete'])
        self.assertIn('svenska',runtime.calls[0][0].lower());self.assertIn('12 månader gratis',runtime.calls[0][0])
        self.assertEqual(client.calls[-1][1]['drafts'][0]['toEmail'],CONTACT['email'])
    def test_six_contact_job_is_refused_without_model_calls(self):
        class BadClient(Client):
            def post(self,operation,**values):
                result=super().post(operation,**values)
                if operation=='claim': result['snapshot']['contacts']=[dict(CONTACT)]*6
                return result
        client=BadClient();runtime=Runtime();self.assertFalse(run_once(client,HarveyDraftAdapter(runtime)))
        self.assertEqual(runtime.calls,[]);self.assertNotIn('complete',[x[0] for x in client.calls])
    def test_model_timeout_is_not_retried(self):
        class Timeout(Runtime):
            def generate(self,*args,**kwargs): self.calls.append(args);raise TimeoutError()
        client=Client();runtime=Timeout();self.assertFalse(run_once(client,HarveyDraftAdapter(runtime)))
        self.assertEqual(len(runtime.calls),1);self.assertEqual(client.calls[-1][0],'report_failure')
if __name__=='__main__': unittest.main()
