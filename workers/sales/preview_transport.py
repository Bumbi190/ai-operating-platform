"""Protected preview only: reuse the owner's authenticated Vercel CLI via stdin."""
import json,subprocess
from .protocol import SalesProtocolClient,ProtocolError,SALES_ENDPOINTS,server_response
class ProtectedPreviewClient:
 def __init__(self,config,token,purpose='worker'):
  SalesProtocolClient(config['origin'],token,purpose)  # validates HTTPS identity and fixed purpose
  self.config=dict(config);self.token=token;self.purpose=purpose
 def post(self,operation,**values):
  body=json.dumps({'operation':operation,**values},ensure_ascii=False)
  if len(body.encode('utf-8'))>65536:raise ProtocolError('REQUEST_TOO_LARGE')
  c=self.config
  curl='\n'.join(['request = "POST"','header = "Content-Type: application/json"','header = '+json.dumps('Authorization: Bearer '+self.token),'data-binary = '+json.dumps(body,ensure_ascii=False),'proxy = ""','max-time = 20','max-redirs = 0','proto = "=https"','silent','show-error'])+'\n'
  command=[c['node'],c['vercelCli'],'curl',SALES_ENDPOINTS[self.purpose],'--deployment',c['origin'],'--scope',c['scope'],'--','--config','-']
  try:
   p=subprocess.run(command,cwd=c['installationRoot'],input=curl.encode('utf-8'),stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=40)
   if p.returncode or len(p.stdout)>131072:raise ProtocolError('PREVIEW_TRANSPORT_FAILED')
   return server_response(p.stdout)
  except ProtocolError:raise
  except Exception:raise ProtocolError('PREVIEW_REQUEST_FAILED') from None
