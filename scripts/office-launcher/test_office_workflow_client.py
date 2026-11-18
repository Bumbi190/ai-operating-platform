"""Fixed production HTTPS construction; socket and disposable worker are doubled."""
import json
import ssl
import threading
import unittest
from unittest.mock import patch
import office_visit_client as api

class WorkflowClientTests(unittest.TestCase):
    def test_workflow_call_has_only_the_fixed_path_and_no_url_override(self):
        with patch.object(api,'_run_bounded',return_value={'synthetic':True}) as run:
            result=api.OfficeVisitClient().workflow_presence('visit','secret',lambda:True)
            self.assertEqual(result,{'synthetic':True});self.assertIs(run.call_args.args[0],api._worker)
            self.assertEqual(run.call_args.args[1],('workflow/presence','visit','secret'))
    def test_workflow_https_uses_certificate_checks_exact_body_and_dedicated_secret(self):
        calls=[];test=self
        class Connection:
            def __init__(self,host,port,timeout,context):
                test.assertEqual((host,port,timeout),('omniraos.se',443,5));test.assertEqual(context.verify_mode,ssl.CERT_REQUIRED);test.assertTrue(context.check_hostname)
            def connect(self):pass
            def request(self,*args,**kwargs):calls.append((args,kwargs))
            def getresponse(self):
                class Response:
                    status=200
                    def read(self,limit):test.assertEqual(limit,32769);return b'{}'
                return Response()
            def close(self):pass
        with patch('http.client.HTTPSConnection',Connection):api._https_read('workflow/presence','synthetic','SECRET',threading.Event())
        args,kwargs=calls[0];self.assertEqual(args,('POST','/api/atlas/office/visits/workflow/presence'))
        self.assertEqual(json.loads(kwargs['body']),{'visitId':'synthetic'});self.assertEqual(kwargs['headers'],{'Content-Type':'application/json','X-Omnira-Office-Visit':'SECRET'})

if __name__=='__main__':unittest.main()
