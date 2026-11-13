"""Foreground visit transport v2; browser cannot publish a presence frame."""
from __future__ import annotations
import base64
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import secrets
import socket
import threading
import time
import uuid
from office_presence import AvatarBinding, PresenceReceiver, _clock, _now
from office_relay import OfficeRelay, _exact_object, _no_duplicate_keys

AVATAR='office-familje-pling'


class VisitPresenceReceiver(PresenceReceiver):
    """Keep legacy20s maximum, additionally cap the visit's last native frame."""
    def __init__(self,binding):
        super().__init__(binding)
        self._visit_until=float('inf');self._visit_monotonic=float('inf');self._hard_monotonic=float('inf')
    def deadlines(self,lease,expiry):
        wall,mono=time.time(),time.monotonic()
        self._hard_monotonic=min(self._hard_monotonic,mono+max(0,expiry-wall))
        self._visit_until=min(lease,expiry)
        self._visit_monotonic=min(self._hard_monotonic,mono+max(0,self._visit_until-wall))
    def view(self,*,now=None):
        now=_now(now);frame=super().view(now=now)
        if now>=self._visit_until or time.monotonic()>=self._visit_monotonic:return self._unknown('stale')
        if frame['expires_at_unix'] is not None:frame['expires_at_unix']=min(frame['expires_at_unix'],self._visit_until)
        return frame


def new_visit_id():
    # Timestamp-bound random UUIDv7: an old claim stays unusable after bounded cleanup.
    value=(int(time.time()*1000)<<80)|(7<<76)|(secrets.randbits(12)<<64)|(2<<62)|secrets.randbits(62)
    return str(uuid.UUID(int=value))


class OfficeVisitRelay(OfficeRelay):
    def __init__(self,output_dir,process,client):
        super().__init__(output_dir,avatars=(AVATAR,))
        self.process,self.client=process,client
        self._secret=base64.urlsafe_b64encode(secrets.token_bytes(32)).decode('ascii').rstrip('=')
        self.visit_id=new_visit_id();self._issued=time.monotonic();self._deadline=self._issued+14400
        self._selection=None;self._attached=threading.Event();self._ack=False;self._revoked=False
        self._expires=None;self._lease=None;self._created=None
        self._claim_exposed=False
        self._committed=threading.Event();self._pending_deadline=float('inf')
        self._authority_deadline=float('inf')
        self._connections=set();self._connections_lock=threading.Lock()

    def pairing_url(self,origin='https://omniraos.se'):
        return super().pairing_url(origin)+'&officeVisit=2'

    def _permitted(self):
        try:return (not self._halt.is_set() and time.monotonic()<min(self._deadline,self._authority_deadline)
                    and (self._committed.is_set() or time.monotonic()<self._pending_deadline) and self.process.alive())
        except Exception:return False

    def _invalidate(self):
        self._halt.set();self._ack=False
        with self._lock:
            try:
                if self._writer_lease is not None:self._clear()
            except OSError:pass  # The saved native consumer still enforces its own20s deadline.

    def _release_writer(self):
        with self._lock:super()._release_writer()

    def _status(self):
        if not self._selection and time.monotonic()-self._issued>15:
            self.visit_id=new_visit_id();self._issued=time.monotonic()
        if self._permitted():self._claim_exposed=True
        view=None if self._receiver is None else self._receiver.view()
        return {'protocol':2,'avatars':[AVATAR],'visitId':self.visit_id,
                'secretDigest':hashlib.sha256(base64.urlsafe_b64decode(self._secret+'=')).hexdigest() if self._secret else None,
                'acknowledged':self._ack and self._permitted() and view is not None and view['identity']=='verified',
                'presence':view,
                'expiresAt':self._expires,'leaseUntil':self._lease}

    def _accept(self,data):
        expected=self._selection
        if not isinstance(data,dict) or any(data.get(k)!=v for k,v in expected.items()):raise ValueError('Scope mismatch')
        now=time.time()
        created,expiry,lease,generated=(_clock(data[k]) for k in ('createdAt','expiresAt','leaseUntil','generatedAt'))
        if (created>now+2 or expiry<=now or lease<=now or expiry-created>14400 or expiry<=created
                or lease>expiry or lease>now+32 or generated>now+2 or now-generated>=20
                or (self._created is not None and (self._created!=created or self._expires!=data['expiresAt']))):raise ValueError('Visit expired or changed')
        binding,snapshot=data['binding'],data['snapshot']
        if (snapshot.get('generatedAt')!=data['generatedAt'] or binding.get('verifiedAt')!=data['generatedAt']
                or snapshot.get('availability',{}).get('stepEvidence') is not False):raise ValueError('Invalid identity frame')
        projects=snapshot.get('projects',[])
        if len(projects)!=1 or len(projects[0].get('agents',[]))!=1:raise ValueError('One identity only')
        agent=projects[0]['agents'][0]
        if agent.get('executionEvidence')!='unavailable' or agent.get('stepRequest') is not None:raise ValueError('Identity only')
        self._receiver.deadlines(lease,expiry)
        frame=self._receiver.accept(binding,snapshot)
        if frame['identity']!='verified':raise ValueError('Unverified frame')
        self._write()
        self._created,self._expires,self._lease=created,data['expiresAt'],data['leaseUntil']
        self._authority_deadline=self._receiver._visit_monotonic
        self._ack=True

    def _poll(self):
        while not self._halt.is_set():
            if not self._attached.wait(.25):continue
            if not self._permitted():self._invalidate();return
            try:
                data=self.client.presence(self.visit_id,self._secret,self._permitted)
                with self._lock:
                    if not self._permitted():return
                    self._accept(data)
            except Exception:
                if not self._halt.is_set():self._invalidate()
                return
            # A browser lost before observing native ack cannot leave renewable polling.
            while not self._committed.wait(.05):
                if not self._permitted():self._invalidate();return
            if self._halt.wait(8):return

    def start(self):
        if self._server is not None or self._halt.is_set():raise RuntimeError('A visit starts once')
        if not self._permitted():raise RuntimeError('Verified game process required')
        self.output_dir.mkdir(parents=True,exist_ok=True)
        if self._writer_lease is None:self._acquire_writer()
        relay=self
        class Server(ThreadingHTTPServer):
            daemon_threads=True
            def handle_error(self,*_):pass  # Never emit request headers or raw payloads.
        class Handler(BaseHTTPRequestHandler):
            protocol_version='HTTP/1.0'
            def setup(self):
                super().setup();self.connection.settimeout(3)
                with relay._connections_lock:relay._connections.add(self.connection)
            def finish(self):
                try:super().finish()
                finally:
                    with relay._connections_lock:relay._connections.discard(self.connection)
            def log_message(self,*_):pass
            def origin(self):return self.headers.get_all('Origin',[])==['https://omniraos.se'] and self.headers.get_all('Host',[])==['127.0.0.1:'+str(relay.port)]
            def reply(self,status,data=None):
                body=b'' if data is None else json.dumps(data,ensure_ascii=False).encode('utf-8')
                self.send_response(status)
                for k,v in [('Cache-Control','no-store'),('Content-Type','application/json'),('Content-Length',str(len(body))),('X-Content-Type-Options','nosniff'),('Vary','Origin')]:self.send_header(k,v)
                if self.origin():
                    self.send_header('Access-Control-Allow-Origin','https://omniraos.se');self.send_header('Access-Control-Allow-Methods','GET, POST, OPTIONS')
                    self.send_header('Access-Control-Allow-Headers','authorization, content-type');self.send_header('Access-Control-Allow-Private-Network','true')
                self.end_headers()
                if body:self.wfile.write(body)
            def gate(self,preflight=False):
                auth=self.headers.get_all('Authorization',[])
                okay=self.origin()
                if preflight:
                    names=self.headers.get('Access-Control-Request-Headers','').lower().split(',')
                    okay=okay and self.headers.get('Access-Control-Request-Method') in ('GET','POST') and all(n.strip() in ('authorization','content-type') for n in names if n.strip())
                else:okay=okay and len(auth)==1 and auth[0].isascii() and hmac.compare_digest(auth[0],'Bearer '+relay.session_key)
                if not okay:self.reply(403,{'error':'forbidden'})
                return okay
            def do_OPTIONS(self):
                if self.gate(True):self.reply(204 if self.path in ('/status','/attach','/disconnect') else 404)
            def do_GET(self):
                if not self.gate():return
                if self.path!='/status':self.reply(404);return
                with relay._lock:self.reply(200,relay._status())
            def do_POST(self):
                if not self.gate():return
                if self.path not in ('/attach','/disconnect'):self.reply(404);return
                try:
                    sizes=self.headers.get_all('Content-Length',[])
                    if (len(sizes)!=1 or not sizes[0].isascii() or not sizes[0].isdigit() or int(sizes[0])>1024
                            or self.headers.get_all('Transfer-Encoding') or self.headers.get_all('Content-Type')!=['application/json']):raise ValueError('Invalid body')
                    raw=self.rfile.read(int(sizes[0]))
                    if len(raw)!=int(sizes[0]):raise ValueError('Incomplete body')
                    data=json.loads(raw.decode('utf-8'),object_pairs_hook=_no_duplicate_keys,parse_constant=lambda _:(_ for _ in ()).throw(ValueError()))
                    keys=('protocol','stage','visitId','avatarId','projectId','agentId') if self.path=='/attach' else ('protocol','visitId')
                    if not _exact_object(data,keys) or type(data['protocol']) is not int or data['protocol']!=2:raise ValueError('Invalid protocol')
                    with relay._lock:
                        if data['visitId']!=relay.visit_id:self.reply(409);return
                        if relay._halt.is_set() or relay._writer_lease is None:self.reply(409);return
                        if self.path=='/disconnect':
                            relay._halt.set();relay._ack=False;relay._clear();self.reply(200,{'protocol':2,'disconnected':True});return
                        if not relay._permitted():self.reply(409);return
                        selection={k:v for k,v in data.items() if k not in ('protocol','stage')}
                        if data['stage']=='confirm':
                            if selection!=relay._selection or not relay._ack or relay._receiver.view()['identity']!='verified':self.reply(409);return
                            relay._committed.set();self.reply(200,{'protocol':2,'visitId':relay.visit_id,'committed':True});return
                        if data['stage']!='prepare' or relay._selection is not None:self.reply(409);return
                        if data['avatarId']!=AVATAR:raise ValueError('Wrong avatar')
                        selected=AvatarBinding(data['avatarId'],data['projectId'],data['agentId'])
                        relay._selection=selection;relay._pending_deadline=time.monotonic()+15
                        relay._receiver=VisitPresenceReceiver(selected);relay._write();relay._attached.set()
                        self.reply(202,{'protocol':2,'visitId':relay.visit_id,'acknowledged':False})
                except (ValueError,TypeError,KeyError,UnicodeError,RecursionError):self.reply(400,{'error':'invalid_payload'})
                except OSError:self.reply(503,{'error':'local_write_unavailable'})
        try:
            (self.output_dir/(AVATAR+'.json')).unlink(missing_ok=True)
            self._server=Server(('127.0.0.1',0),Handler);self.port=self._server.server_address[1]
            def monitor():
                while not self._halt.wait(.25):
                    if not self._permitted():self._invalidate();return
            def project_expiry():
                while not self._halt.wait(1):
                    with self._lock:
                        try:self._write()
                        except OSError:continue
            self._threads=[threading.Thread(target=self._server.serve_forever,kwargs={'poll_interval':.05},daemon=True),
                           threading.Thread(target=monitor,daemon=True),threading.Thread(target=self._poll,daemon=True),
                           threading.Thread(target=project_expiry,daemon=True)]
            for thread in self._threads:thread.start()
        except BaseException:
            self._release_writer();raise

    def stop(self):
        self._invalidate()
        with self._connections_lock:
            for connection in tuple(self._connections):
                try:connection.shutdown(socket.SHUT_RDWR)
                except OSError:pass
                connection.close()
        try:
            super().stop()
        finally:
            if self._secret and self._claim_exposed and not self._revoked:
                self._revoked=True
                try:self.client.revoke(self.visit_id,self._secret)
                except Exception:pass
            self._secret=None
