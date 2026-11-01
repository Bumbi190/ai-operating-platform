"""Fixed-endpoint, bounded, read-only IMAP evidence reader. Never sends mail."""
import hashlib,imaplib,json,re,ssl,time,socket,threading
from datetime import datetime,timedelta,timezone
from email import policy
from email.parser import BytesHeaderParser
from email.utils import getaddresses,parsedate_to_datetime
from .imap_values import fetch_values,ParseError
from .mime_text import decode_text_part,select_text_part

TOTAL_TIMEOUT=30
class InboxReadError(Exception):pass
def _abort(client):
 try:client.sock.shutdown(socket.SHUT_RDWR)
 except Exception:pass

class _SafeIMAP(imaplib.IMAP4_SSL):
 def __init__(self,*args,**kwargs):
  timer=threading.Timer(kwargs.get('timeout',10),lambda:_abort(self));timer.daemon=True;timer.start()
  try:super().__init__(*args,**kwargs)
  finally:timer.cancel()
 def read(self,size):
  if size>65537:raise InboxReadError('RESPONSE_TOO_LARGE')
  return super().read(size)
 def readline(self):
  value=self.file.readline(65537)
  if len(value)>65536:raise InboxReadError('RESPONSE_TOO_LARGE')
  return value

def _integer(v,minimum=0,maximum=4294967295):
 if isinstance(v,bytes):v=v.decode('ascii')
 if isinstance(v,str):
  if not re.fullmatch(r'0|[1-9][0-9]*',v):raise InboxReadError('RECONCILING')
  v=int(v)
 if type(v) is not int or not minimum<=v<=maximum:raise InboxReadError('RECONCILING')
 return v

def _timestamp(v):
 t=datetime.fromisoformat(v.replace('Z','+00:00'))
 if t.tzinfo is None:raise InboxReadError('RECONCILING')
 return t.astimezone(timezone.utc)

def _line(v,bound):
 s=re.sub(r'[\x00-\x1f\x7f]',' ',str(v or ''))
 return s.encode('utf-8')[:bound].decode('utf-8','ignore')

def _header(raw):
 h=BytesHeaderParser(policy=policy.default).parsebytes(raw)
 def addr(name):
  values=getaddresses([str(x) for x in h.get_all(name,[])])
  return _line(values[0][1].lower(),254) if len(values)==1 else ''
 header={'from':addr('From'),'to':addr('To'),'subject':_line(h.get('Subject'),512),'messageId':_line(h.get('Message-ID'),998) or None,'inReplyTo':_line(h.get('In-Reply-To'),998) or None,'references':[]}
 refs=re.findall(r'<[^<>\s]{1,996}>',str(h.get('References','')))
 for value in refs[:20]:
  candidate={**header,'references':header['references']+[value]}
  if len(json.dumps(candidate,ensure_ascii=False).encode())>4096:break
  header=candidate
 return header

def _content_hash(header_hash,text):
 body=text.encode('utf-8')
 return hashlib.sha256(b'OmniraInbox/v1\n'+bytes.fromhex(header_hash)+len(body).to_bytes(8,'big')+body).hexdigest()

def _vanished(uid):return {'uid':uid,'internalDate':None,'size':None,'headerSha256':None,'header':None,'text':None,'textState':'vanished','contentSha256':None}

def read_inbox_batch(config,cursor,selected_messages,password,*,client_factory=None):
 client=None;timer=None;timed_out=threading.Event()
 try:
  if config.get('folder')!='INBOX' or not isinstance(config.get('email'),str) or '\0' in config['email'] or not isinstance(password,str) or '\0' in password or not 1<=len(password.encode('utf-8'))<=2048:raise InboxReadError('RECONCILING')
  since=_timestamp(config['since']);deadline=time.monotonic()+TOTAL_TIMEOUT
  context=ssl.create_default_context();context.minimum_version=ssl.TLSVersion.TLSv1_2
  client=(client_factory or _SafeIMAP)('imap.strato.de',993,ssl_context=context,timeout=min(10,TOTAL_TIMEOUT));client.debug=0
  def expire():timed_out.set();_abort(client)
  timer=threading.Timer(max(0,deadline-time.monotonic()),expire);timer.daemon=True;timer.start()
  def remaining(limit=30):
   left=min(deadline-time.monotonic(),limit)
   if left<=0:raise InboxReadError('CONNECTION_FAILED')
   client.sock.settimeout(left)
  def call(method,*args):
   remaining();status,data=method(*args)
   if status!='OK':raise InboxReadError('CONNECTION_FAILED')
   return data
  if 'AUTH=PLAIN' not in tuple(x.upper() for x in client.capabilities):raise InboxReadError('AUTH_FAILED')
  remaining(10);auth_responses=[0]
  def auth_response(_):
   auth_responses[0]+=1
   return b'\0'+config['email'].encode()+b'\0'+password.encode() if auth_responses[0]==1 else None
  auth_timer=threading.Timer(min(10,max(0,deadline-time.monotonic())),expire);auth_timer.daemon=True;auth_timer.start()
  try:
   status,_=client.authenticate('PLAIN',auth_response)
   if status!='OK':raise InboxReadError('AUTH_FAILED')
  except imaplib.IMAP4.error:raise InboxReadError('AUTH_FAILED') from None
  finally:auth_timer.cancel()
  call(client.select,'INBOX',True)
  def server_number(name,maximum=4294967295):
   _,data=client.response(name)
   if not isinstance(data,list) or len(data)!=1:raise InboxReadError('RECONCILING')
   return _integer(data[0],1,maximum)
  validity=str(server_number('UIDVALIDITY'));top=server_number('UIDNEXT',4294967296)-1
  saved=_integer(cursor['scannedThroughUid']);same=cursor.get('uidValidity')==validity
  selected=sorted({_integer(x['uid'],1) for x in selected_messages if x.get('uidValidity')==validity})[:20] if same else []
  mode='selected_text' if selected else 'scan'
  low=saved if same else 0
  if same and top<saved:raise InboxReadError('RECONCILING')
  high=min(top,low+500);through=saved if selected else high
  if selected:uids=selected;range_end=saved
  elif high<=low:uids=[];range_end=high
  else:
   previous=(since-timedelta(days=1)).date();months=('Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec');date=f'{previous.day:02d}-{months[previous.month-1]}-{previous.year}'
   data=call(client.uid,'SEARCH',None,'UID',f'{low+1}:{high}','SINCE',date)
   if len(data)!=1 or not isinstance(data[0],bytes) or len(data[0])>12000:raise InboxReadError('RECONCILING')
   candidates=sorted({_integer(x,1) for x in data[0].split() if low<_integer(x,1)<=high})
   uids=candidates[:20];range_end=high
   if len(candidates)>20:through=uids[-1]
  records=[];processed=low
  for uid in uids:
   data=call(client.uid,'FETCH',str(uid),'(UID INTERNALDATE RFC822.SIZE BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT MESSAGE-ID IN-REPLY-TO REFERENCES DATE)]<0.8193>)')
   parsed=fetch_values(data,uid)
   if parsed is None:record=_vanished(uid)
   else:
    values,literals=parsed
    if len(literals)!=1 or not isinstance(values.get(b'INTERNALDATE'),bytes):raise InboxReadError('RECONCILING')
    observed=parsedate_to_datetime(values[b'INTERNALDATE'].decode('ascii')).astimezone(timezone.utc)
    if observed<since:
     if selected:raise InboxReadError('RECONCILING')
     processed=uid;continue
    raw=literals[0];headers=_header(raw);header_hash=hashlib.sha256(raw).hexdigest()
    record={'uid':uid,'internalDate':observed.isoformat().replace('+00:00','Z'),'size':_integer(values.get(b'RFC822.SIZE'),0,2**63-1),'headerSha256':header_hash,'header':headers,'text':None,'textState':'not_selected','contentSha256':None}
    wanted=bool(selected) or headers['from'] in config.get('selectedAddresses',[])
    if len(raw)>8192:record['textState']='too_large'
    elif wanted:
     parsed_structure=fetch_values(call(client.uid,'FETCH',str(uid),'(UID BODYSTRUCTURE)'),uid)
     part=select_text_part(parsed_structure[0].get(b'BODYSTRUCTURE')) if parsed_structure else None
     if part is None:record['textState']='unsupported'
     elif part['size']>65536:record['textState']='too_large'
     else:
      section=part['section'];mime=fetch_values(call(client.uid,'FETCH',str(uid),f'(UID BODY.PEEK[{section}.MIME]<0.8193>)'),uid)
      if mime is None:record=_vanished(uid)
      else:
       if len(mime[1])!=1:raise InboxReadError('RECONCILING')
       mime_headers=mime[1][0];mh=BytesHeaderParser(policy=policy.default).parsebytes(mime_headers)
       if len(mime_headers)>8192 or mh.get_content_type() not in ('text/plain','text/html') or mh.get_content_disposition()=='attachment' or mh.get_filename():record['textState']='unsupported'
       else:
        body=fetch_values(call(client.uid,'FETCH',str(uid),f'(UID BODY.PEEK[{section}]<0.65537>)'),uid)
        if body is None:record=_vanished(uid)
        else:
         if len(body[1])!=1:raise InboxReadError('RECONCILING')
         record.update(decode_text_part(mime_headers,body[1][0]))
         if record['textState']=='complete':record['contentSha256']=_content_hash(header_hash,record['text'])
   if len(json.dumps(records+[record],ensure_ascii=False,separators=(',',':')).encode())>48000:
    through=saved if selected else processed;break
   records.append(record);processed=uid
  if timed_out.is_set() or time.monotonic()>deadline:raise InboxReadError('CONNECTION_FAILED')
  return {'mode':mode,'uidValidity':validity,'throughUid':through,'rangeEnd':range_end,'records':records}
 except InboxReadError:
  if timed_out.is_set():raise InboxReadError('CONNECTION_FAILED') from None
  raise
 except ssl.SSLError:raise InboxReadError('TLS_FAILED') from None
 except (ParseError,ValueError,TypeError,KeyError,OverflowError):
  raise InboxReadError('CONNECTION_FAILED' if timed_out.is_set() else 'RECONCILING') from None
 except Exception:raise InboxReadError('CONNECTION_FAILED') from None
 finally:
  if timer is not None:timer.cancel()
  if client is not None:
   try:client.sock.settimeout(1);client.logout()
   except Exception:
    try:client.shutdown()
    except Exception:pass
