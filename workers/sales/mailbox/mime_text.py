"""Bounded text-only MIME extraction. No network, attachments or active HTML."""
import base64,quopri,re
from email import policy
from email.parser import BytesHeaderParser
from html.parser import HTMLParser

class _TextHTML(HTMLParser):
 def __init__(self):super().__init__(convert_charrefs=True);self.hidden=[];self.parts=[]
 def handle_starttag(self,tag,attrs):
  if tag in ('script','style','svg','template','noscript','head'):self.hidden.append(tag)
  if not self.hidden and tag in ('p','br','div','li','tr','h1','h2','h3'):self.parts.append('\n')
 def handle_endtag(self,tag):
  if self.hidden and tag==self.hidden[-1]:self.hidden.pop()
  if not self.hidden and tag in ('p','div','li','tr'):self.parts.append('\n')
 def handle_data(self,data):
  if not self.hidden:self.parts.append(data)

def decode_text_part(mime_headers,encoded_bytes):
 try:
  if not isinstance(encoded_bytes,bytes) or len(encoded_bytes)>65536:return {'text':None,'textState':'too_large'}
  if not isinstance(mime_headers,bytes) or len(mime_headers)>8192:raise ValueError()
  h=BytesHeaderParser(policy=policy.default).parsebytes(mime_headers)
  if h.get_content_type() not in ('text/plain','text/html') or h.get_content_disposition()=='attachment' or h.get_filename():raise ValueError()
  encoding=str(h.get('Content-Transfer-Encoding','7bit')).strip().lower()
  if encoding=='base64':data=base64.b64decode(b''.join(encoded_bytes.split()),validate=True)
  elif encoding=='quoted-printable':
   if re.search(rb'=(?![0-9A-Fa-f]{2}|\r?\n)',encoded_bytes):raise ValueError()
   data=quopri.decodestring(encoded_bytes)
  elif encoding in ('7bit','8bit','binary'):data=encoded_bytes
  else:raise ValueError()
  text=data.decode(h.get_content_charset() or 'ascii',errors='strict')
  if h.get_content_type()=='text/html':
   parser=_TextHTML();parser.feed(text);parser.close();text=''.join(parser.parts)
  text=re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]','',text).replace('\r\n','\n').replace('\r','\n').strip()
  raw=text.encode('utf-8');state='complete'
  if len(raw)>8192:text=raw[:8192].decode('utf-8','ignore');state='truncated'
  return {'text':text,'textState':state}
 except Exception:return {'text':None,'textState':'unsupported'}

def select_text_part(structure):
 count=[0];choices=[]
 def attached(params,disposition):
  if isinstance(params,list) and any(isinstance(p,bytes) and p.upper().split(b'*',1)[0] in (b'NAME',b'FILENAME') for p in params[::2]):return True
  if isinstance(disposition,list) and disposition:
   if isinstance(disposition[0],bytes) and disposition[0].upper()==b'ATTACHMENT':return True
   if len(disposition)>1 and isinstance(disposition[1],list) and any(isinstance(p,bytes) and p.upper().split(b'*',1)[0] in (b'NAME',b'FILENAME') for p in disposition[1][::2]):return True
  return False
 def walk(node,path,depth):
  count[0]+=1
  if depth>8 or count[0]>50 or not isinstance(node,list) or not node:raise ValueError()
  if isinstance(node[0],list):
   children=[]
   for child in node:
    if not isinstance(child,list):break
    children.append(child)
   index=len(children)
   if index>=len(node) or not isinstance(node[index],bytes):raise ValueError()
   params=node[index+1] if len(node)>index+1 else None
   disposition=node[index+2] if len(node)>index+2 else None
   if attached(params,disposition):return
   for i,child in enumerate(children):walk(child,path+[str(i+1)],depth+1)
   return
  if len(node)<7:return
  major,minor=(x.upper() if isinstance(x,bytes) else x for x in node[0:2])
  if major!=b'TEXT' or minor not in (b'PLAIN',b'HTML') or type(node[6]) is not int or node[6]<0:return
  # Attachment disposition on either a container or a leaf excludes its subtree.
  if attached(node[2],node[9] if len(node)>9 else None):return
  choices.append((0 if minor==b'PLAIN' else 1,{'section':'.'.join(path) or '1','size':node[6]}))
 try:walk(structure,[],0)
 except Exception:return None
 return sorted(choices,key=lambda x:x[0])[0][1] if choices else None
