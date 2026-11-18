"""Loopback-only synthetic IMAP server; never connects to a real mailbox."""
import imaplib,re,socketserver,threading,time
from contextlib import contextmanager

class Handler(socketserver.StreamRequestHandler):
 def handle(self):
  state=self.server.state
  def send(value):self.wfile.write(value+b'\r\n');self.wfile.flush()
  def literal(uid,section,value,metadata=b''):
   send(b'* 1 FETCH (UID '+str(uid).encode()+b' '+metadata+section+b' {'+str(len(value)).encode()+b'}')
   if state.get('slowLiteral'):
    for byte in value:
     self.wfile.write(bytes([byte]));self.wfile.flush();time.sleep(0.03)
    self.wfile.write(b')\r\n');self.wfile.flush()
   else:self.wfile.write(value+b')\r\n');self.wfile.flush()
  send(b'* OK synthetic inbox')
  while True:
   line=self.rfile.readline(10000)
   if not line:break
   tag,command,*rest=line.rstrip(b'\r\n').split(b' ',2);args=rest[0] if rest else b''
   state['commands'].append((command.decode(),args.decode('ascii','replace')))
   if command==b'CAPABILITY':send(b'* CAPABILITY IMAP4rev1 AUTH=PLAIN')
   elif command==b'AUTHENTICATE':
    send(b'+ ');response=self.rfile.readline(10000);state['authCount']+=1
    if state.get('badAuth'):send(tag+b' NO auth refused');continue
   elif command==b'EXAMINE':
    send(b'* FLAGS (\\Seen)');send(b'* 2 EXISTS');send(b'* OK [UIDVALIDITY '+str(state.get('validity',10)).encode()+b'] epoch');send(b'* OK [UIDNEXT '+str(state.get('next',30)).encode()+b'] next')
   elif command==b'UID':
    op,values=args.split(b' ',1)
    if op==b'SEARCH':
     bounds=re.search(rb'UID (\d+):(\d+)',values);low,high=map(int,bounds.groups())
     ids=[x for x in state['messages'] if low<=x<=high]
     ids+=state.get('extraIds',[]);send(b'* SEARCH '+b' '.join(str(x).encode() for x in sorted(ids)))
    elif op==b'FETCH':
     uid=int(values.split(b' ',1)[0]);m=state['messages'].get(uid)
     if m is not None and not m.get('vanished'):
      metadata=b'INTERNALDATE "'+m.get('date',b'08-Oct-2026 12:00:00 +0200')+b'" RFC822.SIZE 200 '
      if b'HEADER.FIELDS' in values:literal(uid,b'BODY[HEADER.FIELDS (FROM TO SUBJECT MESSAGE-ID IN-REPLY-TO REFERENCES DATE)]<0>',m.get('headers',b'From: Dealer <dealer@example.se>\r\nTo: info@example.se\r\nSubject: Svar\r\nMessage-ID: <one@example.se>\r\n\r\n')[:8193],metadata)
      elif b'BODYSTRUCTURE' in values:send(b'* 1 FETCH (UID '+str(uid).encode()+b' BODYSTRUCTURE '+m.get('structure',b'("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "8BIT" 12 1)')+b')')
      elif b'.MIME' in values:literal(uid,b'BODY[1.MIME]',m.get('mime',b'Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n'))
      else:literal(uid,b'BODY[1]<0>',m.get('body','Tack åäö'.encode())[:65537])
   elif command==b'LOGOUT':send(b'* BYE synthetic done');send(tag+b' OK logout');break
   else:send(tag+b' BAD forbidden command');continue
   send(tag+b' OK done')

@contextmanager
def inbox_server(messages=None,**options):
 state={'messages':messages if messages is not None else {12:{}},'commands':[],'authCount':0,**options}
 class Server(socketserver.ThreadingTCPServer):
  allow_reuse_address=True;daemon_threads=True
  def handle_error(self,*_):pass
 server=Server(('127.0.0.1',0),Handler);server.state=state
 thread=threading.Thread(target=server.serve_forever,kwargs={'poll_interval':0.01},daemon=True);thread.start()
 def factory(host,port,**kw):
  assert (host,port)==('imap.strato.de',993) and kw['ssl_context'].check_hostname
  return imaplib.IMAP4('127.0.0.1',server.server_address[1],timeout=2)
 try:yield state,factory
 finally:server.shutdown();server.server_close();thread.join(timeout=2)
