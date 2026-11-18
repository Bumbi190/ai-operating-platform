"""Small bounded IMAP value parser, preserving literal versus quoted data."""
from dataclasses import dataclass
@dataclass
class Literal:value:bytes
class ParseError(Exception):pass
class Values:
 def __init__(self,data):
  if not isinstance(data,bytes) or len(data)>200000:raise ParseError()
  self.data=data;self.i=0;self.nodes=0
 def all(self,depth=0,closing=False):
  values=[]
  if depth>16:raise ParseError()
  while self.i<len(self.data):
   c=self.data[self.i]
   if c in b' \r\n\t':self.i+=1;continue
   if c==41:
    if not closing:raise ParseError()
    self.i+=1;return values
   self.nodes+=1
   if self.nodes>2000:raise ParseError()
   if c==40:self.i+=1;values.append(self.all(depth+1,True));continue
   if c==34:
    self.i+=1;out=bytearray()
    while self.i<len(self.data):
     c=self.data[self.i];self.i+=1
     if c==34:break
     if c==92:
      if self.i>=len(self.data):raise ParseError()
      c=self.data[self.i];self.i+=1
     out.append(c)
    else:raise ParseError()
    values.append(bytes(out));continue
   if c==123:
    end=self.data.find(b'}\r\n',self.i)
    if end<0 or not self.data[self.i+1:end].isdigit():raise ParseError()
    n=int(self.data[self.i+1:end]);self.i=end+3
    if n>65537 or self.i+n>len(self.data):raise ParseError()
    values.append(Literal(self.data[self.i:self.i+n]));self.i+=n;continue
   start=self.i
   while self.i<len(self.data) and self.data[self.i] not in b' ()\r\n\t':self.i+=1
   atom=self.data[start:self.i]
   if not atom:raise ParseError()
   values.append(None if atom.upper()==b'NIL' else int(atom) if atom.isdigit() else atom)
  if closing:raise ParseError()
  return values

def fetch_values(data,uid):
 raw=b''
 for part in data:
  if isinstance(part,tuple) and len(part)==2 and all(isinstance(x,bytes) for x in part):raw+=part[0]+b'\r\n'+part[1]
  elif isinstance(part,bytes):raw+=part
  elif part is not None:raise ParseError()
 if not raw:return None
 values=Values(raw).all()
 if len(values)!=2 or type(values[0]) is not int or not isinstance(values[1],list):raise ParseError()
 fields=values[1]
 pairs={}
 for i,x in enumerate(fields[:-1]):
  if isinstance(x,bytes) and x.upper() in (b'UID',b'INTERNALDATE',b'RFC822.SIZE',b'BODYSTRUCTURE'):
   if x.upper() in pairs:raise ParseError()
   pairs[x.upper()]=fields[i+1]
 if pairs.get(b'UID')!=uid:raise ParseError()
 return pairs,[x.value for x in fields if isinstance(x,Literal)]
