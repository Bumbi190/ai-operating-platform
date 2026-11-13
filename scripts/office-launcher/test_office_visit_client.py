"""The external TLS socket is doubled; production request construction is real."""
import json
import ssl
import time
import threading
import unittest
from unittest.mock import patch
from office_visit_client import OfficeVisitClient
import office_visit_client as api


def stalled_worker(pipe,cancelled,*args):
    class Connection:
        def __init__(self,*a,**kw):pass
        def connect(self):time.sleep(15)
        def close(self):pass
    with patch('http.client.HTTPSConnection',Connection):api._worker(pipe,cancelled,'presence','synthetic','synthetic-secret')


def slow_closed_response(pipe,cancelled,*args):
    class Connection:
        sock=None
        def __init__(self,*a,**kw):pass
        def connect(self):pass
        def request(self,*a,**kw):pass
        def getresponse(self):
            class Response:
                status=200
                def read(self,size):time.sleep(15);return b'{}'
            return Response()
        def close(self):pass
    with patch('http.client.HTTPSConnection',Connection):api._worker(pipe,cancelled,'presence','synthetic','synthetic-secret')


class ClientTests(unittest.TestCase):
    def test_stalled_dns_and_detached_body_cannot_exceed_total_caller_deadline(self):
        self.assertTrue(callable(getattr(api,'_run_bounded',None)),'Total exchange deadline missing')
        for worker in (stalled_worker,slow_closed_response):
            started=time.monotonic()
            with self.assertRaises(RuntimeError):api._run_bounded(worker,(),lambda:True)
            self.assertLess(time.monotonic()-started,5.5)
    def test_only_fixed_https_origin_path_and_dedicated_header(self):
        requests=[]
        class Connection:
            sock=None
            def __init__(self,host,port,timeout,context):
                self_test.assertEqual((host,port,timeout),('omniraos.se',443,5))
                self_test.assertEqual(context.verify_mode,ssl.CERT_REQUIRED)
                self_test.assertTrue(context.check_hostname)
            def connect(self):pass
            def request(self,method,path,body,headers):requests.append((method,path,body,headers))
            def getresponse(self):
                class Response:
                    status=200
                    def read(self,size):return b'{"visitId":"synthetic"}'
                return Response()
            def close(self):pass
        self_test=self
        with patch('http.client.HTTPSConnection',Connection):
            api._https_read('presence','synthetic','SECRET',threading.Event())
        method,path,body,headers=requests[0]
        self.assertEqual((method,path),('POST','/api/atlas/office/visits/presence'))
        self.assertEqual(json.loads(body),{'visitId':'synthetic'})
        self.assertEqual(headers,{'Content-Type':'application/json','X-Omnira-Office-Visit':'SECRET'})

    def test_redirect_is_rejected_without_forwarding_secret(self):
        calls=[]
        class Connection:
            sock=None
            def __init__(self,*a,**kw):pass
            def connect(self):pass
            def request(self,*a,**kw):calls.append(a)
            def getresponse(self):
                class Response:status=302
                return Response()
            def close(self):pass
        with patch('http.client.HTTPSConnection',Connection):
            with self.assertRaises(RuntimeError):api._https_read('presence','synthetic','SECRET',threading.Event())
        self.assertEqual(len(calls),1)

    def test_observed_stop_prevents_request_after_a_slow_connect(self):
        class Connection:
            sock=None
            def __init__(self,*a,**kw):pass
            def connect(self):pass
            def request(self,*a,**kw):raise AssertionError('Request after stop')
            def close(self):pass
        with patch('http.client.HTTPSConnection',Connection):
            cancelled=threading.Event();cancelled.set()
            with self.assertRaises(RuntimeError):api._https_read('presence','synthetic','SECRET',cancelled)
