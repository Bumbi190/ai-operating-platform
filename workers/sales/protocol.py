import json
import re
import urllib.request
import urllib.error
from urllib.parse import urlsplit
SERVER_CODES={'NOT_FOUND','FENCED','STOPPED','INVALID_BODY','UNAUTHORIZED','REVISION_CONFLICT','UNAVAILABLE'}
SALES_ENDPOINTS={'worker':'/api/sales/worker','host':'/api/sales/host','mailbox':'/api/sales/mailbox/host','inbox':'/api/sales/inbox/host','reply':'/api/sales/replies/worker'}
class ProtocolError(Exception):
    def __init__(self,code):
        super().__init__(code);self.code=code if code in SERVER_CODES else None
def server_response(raw):
    result=json.loads(raw.decode('utf-8'))
    if not isinstance(result,dict):raise ProtocolError('INVALID_RESPONSE')
    if 'code' in result:raise ProtocolError(result['code'] if result['code'] in SERVER_CODES else 'REQUEST_REFUSED')
    return result
class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):raise ProtocolError('REDIRECT_REFUSED')
class SalesProtocolClient:
    def __init__(self,origin,token,purpose="worker"):
        u=urlsplit(origin)
        if u.scheme!='https' or not u.hostname or u.username or u.password or u.query or u.fragment or u.path not in ('','/') or not re.fullmatch(r'[A-Za-z0-9_-]{43}',token):raise ProtocolError('INVALID_CONNECTION')
        if purpose not in SALES_ENDPOINTS:raise ProtocolError('INVALID_PURPOSE')
        self.url=origin.rstrip('/')+SALES_ENDPOINTS[purpose];self._token=token
        self.opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),_NoRedirect())
    def post(self,operation,**values):
        data=json.dumps({'operation':operation,**values},ensure_ascii=False).encode('utf-8')
        if len(data)>65536:raise ProtocolError('REQUEST_TOO_LARGE')
        r=urllib.request.Request(self.url,data=data,headers={'Authorization':'Bearer '+self._token,'Content-Type':'application/json'})
        try:
            with self.opener.open(r,timeout=20) as response:
                raw=response.read(131073)
                if len(raw)>131072:raise ProtocolError('RESPONSE_TOO_LARGE')
                return server_response(raw)
        except urllib.error.HTTPError as error:
            try:server_response(error.read(131073))
            except ProtocolError:raise
            except Exception:pass
            raise ProtocolError('WORKER_REQUEST_FAILED') from None
        except ProtocolError:raise
        except Exception:raise ProtocolError('WORKER_REQUEST_FAILED') from None
