import unittest,hashlib,json,tempfile
from pathlib import Path
from unittest.mock import patch
import office_activity_upgrade as upgrade
import office_entry_install as entry

def rendered(module):
 hashes={'module.py':hashlib.sha256(module).hexdigest()}
 return b'_EXPECTED = '+json.dumps(hashes,sort_keys=True).encode('ascii')+b'\nprint("fixed")\n'

class PriorBundleTests(unittest.TestCase):
 def test_exact_pinned_bundle_with_windows_newlines(self):
  expected={'module.py':b'a=1\nb=2\n','office_entry.py':rendered(b'a=1\nb=2\n')}
  actual={'module.py':b'a=1\r\nb=2\r\n','office_entry.py':rendered(b'a=1\r\nb=2\r\n').replace(b'\n',b'\r\n')}
  pinned=entry._bundle_id(actual)
  upgrade.verify_prior_payloads(expected,actual,pinned)
  for key in actual:
   broken=dict(actual);broken[key]+=b'# foreign edit\n'
   with self.assertRaises(ValueError):upgrade.verify_prior_payloads(expected,broken,pinned)
  with self.assertRaises(ValueError):upgrade.verify_prior_payloads(expected,actual,'wrong-id')
 def test_unknown_module_is_rejected(self):
  p={'module.py':b'a=1\n','office_entry.py':rendered(b'a=1\n')}
  with self.assertRaises(ValueError):upgrade.verify_prior_payloads(p,{**p,'foreign.py':b''},entry._bundle_id(p))

class PinnedRestoreTests(unittest.TestCase):
 def test_restore_uses_record_without_rebuilding_deleted_new_bundle(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);interpreter=root/'pythonw.exe';interpreter.write_bytes(b'python')
   payload={'module.py':b'old'};old_id=entry._bundle_id(payload);new_id='a'*64
   old_bundle=root/'visits'/old_id;old_bundle.mkdir(parents=True)
   for name,data in payload.items():(old_bundle/name).write_bytes(data)
   old=entry.Registration(entry.VISIT_OWNER,entry.visit_command(old_bundle,interpreter))
   new=entry.Registration(entry.VISIT_OWNER,entry.visit_command(root/'visits'/new_id,interpreter))
   state={'current':new}
   registry=type('Registry',(),{'read':lambda _,effective=False:state['current'],'write':lambda _,r:state.update(current=r)})()
   record={'schema':'office_activity_upgrade_v1','old_id':old_id,'new_id':new_id,'interpreter':str(interpreter),'old_command':old.command,'new_command':new.command}
   (root/'activity_upgrade.json').write_text(json.dumps(record))
   with patch.object(upgrade,'PREVIOUS_BUNDLE',old_id),patch.object(entry,'prepare_bundle',side_effect=AssertionError('restore must not prepare')):
    upgrade.restore_record(root,registry)
   self.assertEqual(state['current'],old);self.assertFalse((root/'visits'/new_id).exists())

if __name__=='__main__':unittest.main()
