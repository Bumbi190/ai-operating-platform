"""Small trusted Node crypto helper; secrets only through captured stdin/stdout."""
import json,subprocess
from pathlib import Path
class CryptoRefused(Exception):pass
class MailboxCrypto:
 def __init__(self,store,name,node):self.store=store;self.name=name;self.node=node;self.helper=Path(__file__).with_name('crypto-helper.mjs')
 def _call(self,**values):
  try:
   raw=json.dumps(values,ensure_ascii=False).encode('utf-8')
   if len(raw)>16384:raise CryptoRefused()
   p=subprocess.run([self.node,str(self.helper)],input=raw,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=10,cwd=self.helper.parent)
   if p.returncode or len(p.stdout)>8192:raise CryptoRefused()
   r=json.loads(p.stdout.decode('utf-8'))
   if not isinstance(r,dict) or 'error' in r:raise CryptoRefused()
   return r
  except Exception:raise CryptoRefused('CRYPTO_REFUSED') from None
 def _private(self):
  try:key=self.store.read(self.name)
  except FileNotFoundError:
   r=self._call(action='generate');key=r['privateKey']
   if len(key.encode())>2560:raise CryptoRefused('KEY_TOO_LARGE')
   self.store.write(self.name,key)
   if self.store.read(self.name)!=key:raise CryptoRefused('KEY_READBACK_FAILED')
  if not isinstance(key,str) or len(key.encode())>2560:raise CryptoRefused('KEY_TOO_LARGE')
  return key
 def public_key(self):return self._call(action='public',privateKey=self._private())
 def open(self,context,envelope):return self._call(action='open',privateKey=self._private(),context=context,envelope=envelope)
