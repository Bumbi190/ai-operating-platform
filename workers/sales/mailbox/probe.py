"""Fixed Strato endpoints, verified TLS, PLAIN auth only. Never reads or sends mail."""
import base64,imaplib,smtplib,socket,ssl,time
from datetime import datetime,timezone
def stamp():return datetime.now(timezone.utc).isoformat()
def _remaining(client,deadline):
 remaining=deadline-time.monotonic()
 if remaining<=0:raise TimeoutError()
 client.sock.settimeout(remaining)
def probe_strato(email,password,clients=None):
 result={'smtpAuthenticatedAt':None,'imapAuthenticatedAt':None,'localStored':False,'reasonCode':None}
 if not isinstance(email,str) or not isinstance(password,str) or '\0' in email or '\0' in password or not 1<=len(password.encode('utf-8'))<=2048:
  result['reasonCode']='AUTH_FAILED';return result
 clients=clients or {'smtp':lambda host,port,**kw:smtplib.SMTP_SSL(host,port,context=kw['ssl_context'],timeout=kw['timeout']),'imap':imaplib.IMAP4_SSL}
 context=ssl.create_default_context();context.minimum_version=ssl.TLSVersion.TLSv1_2
 credential=b'\0'+email.encode('utf-8')+b'\0'+password.encode('utf-8')
 smtp=None;imap=None;phase='smtp'
 try:
  deadline=time.monotonic()+10;smtp=clients['smtp']('smtp.strato.de',465,ssl_context=context,timeout=10);smtp.set_debuglevel(0);_remaining(smtp,deadline)
  code,_=smtp.ehlo()
  if code!=250:result['reasonCode']='CONNECTION_FAILED';return result
  if 'PLAIN' not in smtp.esmtp_features.get('auth','').upper().split():result['reasonCode']='UNSUPPORTED_AUTH';return result
  _remaining(smtp,deadline);code,_=smtp.docmd('AUTH','PLAIN '+base64.b64encode(credential).decode('ascii'))
  if code!=235:result['reasonCode']='SMTP_AUTH_FAILED';return result
  result['smtpAuthenticatedAt']=stamp();phase='imap';deadline=time.monotonic()+10
  imap=clients['imap']('imap.strato.de',993,ssl_context=context,timeout=10);imap.debug=0
  if b'AUTH=PLAIN' not in tuple(c.upper() for c in imap.capabilities):result['reasonCode']='UNSUPPORTED_AUTH';return result
  _remaining(imap,deadline);status,_=imap.authenticate('PLAIN',lambda _:credential)
  if status!='OK':result['reasonCode']='IMAP_AUTH_FAILED';return result
  result['imapAuthenticatedAt']=stamp();return result
 except ssl.SSLError:result['reasonCode']='TLS_FAILED'
 except (TimeoutError,socket.timeout,ConnectionError,OSError):result['reasonCode']='CONNECTION_FAILED'
 except Exception:result['reasonCode']='SMTP_AUTH_FAILED' if phase=='smtp' else 'IMAP_AUTH_FAILED'
 finally:
  if imap is not None:
   try:imap.sock.settimeout(1);imap.logout()
   except Exception:
    try:imap.shutdown()
    except Exception:pass
  if smtp is not None:
   try:smtp.sock.settimeout(1);smtp.quit()
   except Exception:
    try:smtp.close()
    except Exception:pass
 return result
