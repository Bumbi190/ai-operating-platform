import json,shutil,subprocess,unittest
from pathlib import Path
from workers.sales.mailbox.crypto import MailboxCrypto,CryptoRefused
class Store:
 def __init__(self):self.values={}
 def read(self,n):
  if n not in self.values:raise FileNotFoundError()
  return self.values[n]
 def write(self,n,v):self.values[n]=v
class CryptoTests(unittest.TestCase):
 def setUp(self):self.store=Store();self.crypto=MailboxCrypto(self.store,'mailbox-key',shutil.which('node'))
 def test_key_is_persisted_in_os_store_and_never_in_file(self):
  p=self.crypto.public_key();self.assertEqual(p['jwk']['e'],'AQAB');self.assertEqual(len(p['kid']),64);self.assertLessEqual(len(self.store.values['mailbox-key'].encode()),2560);self.assertEqual(p,self.crypto.public_key())
 def test_oversized_private_key_is_refused_without_helper(self):
  self.store.values['mailbox-key']='A'*2561
  with self.assertRaises(CryptoRefused):self.crypto.public_key()
 def test_existing_invalid_key_is_not_overwritten(self):
  self.store.values['mailbox-key']='corrupt'
  with self.assertRaises(CryptoRefused):self.crypto.public_key()
  self.assertEqual(self.store.values['mailbox-key'],'corrupt')
