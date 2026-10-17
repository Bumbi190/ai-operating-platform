import json,subprocess,unittest
from unittest.mock import patch
from workers.sales.preview_transport import ProtectedPreviewClient
from workers.sales.protocol import ProtocolError
class PreviewTransportTests(unittest.TestCase):
 def test_bearer_is_only_in_stdin_and_paths_are_fixed(self):
  secret='x'*43;config={'origin':'https://preview.vercel.app','node':'C:/node.exe','vercelCli':'C:/vercel.js','installationRoot':'C:/owned','scope':'owner'}
  for purpose in ('worker','host','mailbox'):
   with patch('workers.sales.preview_transport.subprocess.run',return_value=subprocess.CompletedProcess([],0,b'{"ok":true}')) as run:
    result=ProtectedPreviewClient(config,secret,purpose).post('poll');self.assertTrue(result['ok'])
    args=run.call_args.args[0];self.assertNotIn(secret,json.dumps(args));self.assertIn('/api/sales/mailbox/host' if purpose=='mailbox' else '/api/sales/'+purpose,args);self.assertIn(secret,run.call_args.kwargs['input'].decode());self.assertEqual(run.call_args.kwargs['stderr'],subprocess.DEVNULL)
 def test_no_arbitrary_endpoint_or_non_https_origin(self):
  for origin,purpose in [('http://preview.vercel.app','host'),('https://preview.vercel.app','shell')]:
   with self.assertRaises(ProtocolError):ProtectedPreviewClient({'origin':origin},'x'*43,purpose)
 def test_provider_errors_are_sanitized(self):
  c=ProtectedPreviewClient({'origin':'https://preview.vercel.app','node':'node','vercelCli':'cli','installationRoot':'C:/owned','scope':'owner'},'x'*43,'host')
  with patch('workers.sales.preview_transport.subprocess.run',side_effect=RuntimeError('SECRET')):
   with self.assertRaisesRegex(ProtocolError,'PREVIEW_REQUEST_FAILED'):c.post('poll')
