"""Isolated bundle and registry fixtures; never changes a real protocol registration."""
import importlib.util
import json
import runpy
import shutil
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

HERE=Path(__file__).parent
SPEC=importlib.util.find_spec('office_entry_install')
if SPEC:
    import office_entry_install as installer

class Registry:
    def __init__(self,registration):
        self.current=registration;self.effective=None;self.writes=[];self.fail_once=False
    def read(self,effective=False):
        return self.effective if effective and self.effective is not None else self.current
    def write(self,registration):
        self.writes.append(registration)
        if self.fail_once:
            self.fail_once=False
            self.current=installer.Registration(self.current.owner,registration.command)
            raise OSError('Synthetic registry failure')
        self.current=registration

class EntryTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(SPEC,'Fixed Office visit entry installer is missing')
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)/'Office Launcher';self.root.mkdir()
        (self.root/'office_launcher.py').write_bytes((HERE/'office_launcher.py').read_bytes())
        self.interpreter=Path(sys.executable)
        self.old=installer.Registration('Omnira.OfficeLauncher.v1',installer.legacy_command(self.root,self.interpreter))
        self.registry=Registry(self.old)
    def install(self):
        return installer.install_visit(HERE,self.root,self.registry,self.interpreter)
    def test_fixed_bundle_contains_only_runtime_and_recorded_native_sources(self):
        result=self.install();bundle=Path(result['bundle'])
        self.assertEqual(set(p.name for p in bundle.iterdir()),set(installer.MODULES)|{'office_entry.py'})
        for name in installer.MODULES:self.assertEqual((bundle/name).read_bytes(),(HERE/name).read_bytes())
        self.assertEqual((self.root/'office_launcher.py').read_bytes(),(HERE/'office_launcher.py').read_bytes())
        self.assertIn(' -I ',self.registry.current.command)
        self.assertNotIn('--open',self.registry.current.command)
    def test_install_idempotent_and_restore_preserves_bundle_and_original_file(self):
        result=self.install();first=self.registry.current
        again=self.install();self.assertEqual(result['bundle'],again['bundle'])
        self.assertEqual(self.registry.current,first)
        restored=installer.restore_launcher(HERE,self.root,self.registry,self.interpreter)
        self.assertEqual(self.registry.current,self.old);self.assertTrue(Path(result['bundle']).is_dir())
        self.assertTrue(restored['local_files_retained'])
    def test_foreign_effective_registration_is_preserved_before_any_bundle_creation(self):
        self.registry.effective=installer.Registration('Foreign','untrusted "%1"')
        with self.assertRaises(RuntimeError):self.install()
        self.assertEqual(self.registry.writes,[]);self.assertFalse((self.root/'visits').exists())
    def test_altered_owned_command_or_legacy_bytes_are_preserved(self):
        self.registry.current=installer.Registration(self.old.owner,'foreign "%1"')
        with self.assertRaises(RuntimeError):self.install()
        self.assertEqual(self.registry.writes,[])
        self.registry.current=self.old
        (self.root/'office_launcher.py').write_bytes(b'local edit')
        with self.assertRaises(RuntimeError):self.install()
        self.assertEqual((self.root/'office_launcher.py').read_bytes(),b'local edit')
        self.assertEqual(self.registry.writes,[])
    def test_partial_registration_failure_restores_exact_previous_registration(self):
        self.registry.fail_once=True
        with self.assertRaises(OSError):self.install()
        self.assertEqual(self.registry.current,self.old)
    def test_restore_refuses_unknown_registration_or_modified_bundle(self):
        result=self.install();new=self.registry.current
        self.registry.current=installer.Registration(new.owner,new.command+' --other')
        with self.assertRaises(RuntimeError):installer.restore_launcher(HERE,self.root,self.registry,self.interpreter)
        self.registry.current=new
        (Path(result['bundle'])/'office_visit.py').write_bytes(b'print("untrusted")')
        with self.assertRaises(RuntimeError):installer.restore_launcher(HERE,self.root,self.registry,self.interpreter)
        self.assertEqual(self.registry.current,new)
    def test_existing_bundle_drift_is_not_overwritten(self):
        result=self.install();path=Path(result['bundle'])/'office_visit.py';path.write_bytes(b'edit')
        with self.assertRaises(RuntimeError):self.install()
        self.assertEqual(path.read_bytes(),b'edit')
    def test_untrusted_uri_rejected_with_isolation_and_without_importing_product(self):
        bundle=installer.prepare_bundle(HERE,self.root/'visits')
        (bundle/'office_visit.py').write_text('raise RuntimeError("SECRET_SENTINEL")')
        cases=['omnira-office://visit?cmd=calc','omnira-office://visit#x','omnira-office://visit/other',
               'omnira-office://VISIT','omnira-office://user@visit','omnira-office://visit:80',
               'omnira-office://visit\n',' omnira-office://visit','omnira-office://visit" --install',
               'omnira-office://visit%00','omnira-office://visit;calc','https://omniraos.se','']
        for uri in cases:
            with self.subTest(uri=uri):
                p=subprocess.run([sys.executable,'-I',str(bundle/'office_entry.py'),uri],
                    capture_output=True,text=True,encoding='utf-8',timeout=10)
                self.assertNotEqual(p.returncode,0)
                self.assertNotIn('SECRET_SENTINEL',p.stdout+p.stderr)
                self.assertNotIn(uri,p.stdout+p.stderr) if uri else None
    def test_missing_changed_or_extra_module_fails_before_product_import(self):
        bundle=installer.prepare_bundle(HERE,self.root/'visits')
        victim=bundle/'office_visit.py';before=victim.read_bytes()
        for kind in ['missing','modified','extra']:
            with self.subTest(kind=kind):
                if kind=='missing':victim.unlink()
                elif kind=='modified':victim.write_bytes(b'raise RuntimeError("SECRET_SENTINEL")')
                else:(bundle/'sitecustomize.py').write_bytes(b'raise RuntimeError("SECRET_SENTINEL")')
                p=subprocess.run([sys.executable,'-I',str(bundle/'office_entry.py'),'omnira-office://visit'],
                    capture_output=True,text=True,encoding='utf-8',timeout=10)
                self.assertNotEqual(p.returncode,0);self.assertNotIn('SECRET_SENTINEL',p.stdout+p.stderr)
                victim.write_bytes(before);(bundle/'sitecustomize.py').unlink(missing_ok=True)
    def test_isolated_bundle_import_ignores_cwd_and_pythonpath(self):
        bundle=installer.prepare_bundle(HERE,self.root/'visits')
        poison=Path(self.tmp.name)/'poison';poison.mkdir()
        (poison/'office_visit.py').write_text('raise RuntimeError("SECRET_SENTINEL")')
        code="import runpy,sys;from pathlib import Path;e=runpy.run_path(sys.argv[1]);b=e['verify_bundle']();sys.path.insert(0,str(b));import office_visit,office_pairing,office_visit_client;assert Path(office_visit.__file__).parent==b;print('isolated_import_ok')"
        p=subprocess.run([sys.executable,'-I','-c',code,str(bundle/'office_entry.py')],
            cwd=poison,env={**os.environ,'PYTHONPATH':str(poison)},capture_output=True,text=True,encoding='utf-8',timeout=10)
        self.assertEqual(p.returncode,0,p.stderr);self.assertIn('isolated_import_ok',p.stdout)
    def test_bundle_rejects_bytecode_directory(self):
        bundle=installer.prepare_bundle(HERE,self.root/'visits')
        (bundle/'__pycache__').mkdir()
        code="import runpy,sys;e=runpy.run_path(sys.argv[1]);e['verify_bundle']()"
        p=subprocess.run([sys.executable,'-I','-B','-c',code,str(bundle/'office_entry.py')],
            capture_output=True,text=True,encoding='utf-8',timeout=10)
        self.assertNotEqual(p.returncode,0)
    def test_bundled_spawn_worker_imports_fixed_client_without_entry_relaunch(self):
        bundle=installer.prepare_bundle(HERE,self.root/'visits')
        harness=Path(self.tmp.name)/'spawn_probe.py'
        harness.write_text(r"""
import runpy,sys
from pathlib import Path
def harmless(pipe,cancelled):
 import office_visit_client
 pipe.send(('ok',{'module':office_visit_client.__file__,'workerModule':office_visit_client._worker.__module__}))
 pipe.close()
if __name__=='__main__':
 e=runpy.run_path(sys.argv[1]);b=e['verify_bundle']();sys.path.insert(0,str(b))
 from office_visit_client import _run_bounded
 result=_run_bounded(harmless,(),lambda:True)
 assert Path(result['module']).parent==b and result['workerModule']=='office_visit_client'
 e['verify_bundle']()
 print('spawn_import_ok')
""",encoding='utf-8')
        p=subprocess.run([sys.executable,'-I','-B',str(harness),str(bundle/'office_entry.py')],
            capture_output=True,text=True,encoding='utf-8',timeout=10)
        self.assertEqual(p.returncode,0,p.stderr);self.assertIn('spawn_import_ok',p.stdout)
    def test_redirected_bundle_directory_is_rejected(self):
        bundle=installer.prepare_bundle(HERE,self.root/'visits')
        link=self.root/'redirected'
        if os.name=='nt':
            subprocess.run(['cmd','/c','mklink','/J',str(link),str(bundle)],capture_output=True,check=True)
        else:
            link.symlink_to(bundle,target_is_directory=True)
        code="import runpy,sys;e=runpy.run_path(sys.argv[1]);e['verify_bundle']()"
        p=subprocess.run([sys.executable,'-I','-B','-c',code,str(link/'office_entry.py')],
            capture_output=True,text=True,encoding='utf-8',timeout=10)
        self.assertNotEqual(p.returncode,0)
    def test_worker_revalidates_real_entry_before_importing_changed_module(self):
        bundle=installer.prepare_bundle(HERE,self.root/'visits')
        harness=Path(self.tmp.name)/'real_entry_spawn.py'
        harness.write_text(r"""
import runpy,sys
from pathlib import Path
if __name__=='__main__':
 e=runpy.run_path(sys.argv[1]);b=e['verify_bundle']();sys.path.insert(0,str(b))
 import office_visit_client as api
 sys.modules['__main__'].__file__=str(b/'office_entry.py')
 (b/'office_visit_client.py').write_text('raise RuntimeError("UNTRUSTED_MODULE_SENTINEL")')
 try: api._run_bounded(api._worker,('presence','fixture-id','fixture-secret'),lambda:True)
 except RuntimeError: print('worker_denied')
 else: raise AssertionError('Changed module was accepted')
""",encoding='utf-8')
        p=subprocess.run([sys.executable,'-I','-B',str(harness),str(bundle/'office_entry.py')],
            capture_output=True,text=True,encoding='utf-8',timeout=10)
        self.assertEqual(p.returncode,0,p.stderr);self.assertIn('worker_denied',p.stdout)
        self.assertNotIn('UNTRUSTED_MODULE_SENTINEL',p.stdout+p.stderr)
    def test_restore_cli_does_not_require_a_healthy_native_receiver(self):
        self.interpreter=Path(sys.executable).with_name('pythonw.exe')
        self.old=installer.Registration('Omnira.OfficeLauncher.v1',installer.legacy_command(self.root,self.interpreter))
        self.registry=Registry(self.old);self.install()
        with patch('office_launcher.install_dir',return_value=self.root), \
             patch('office_pairing.check_native',side_effect=RuntimeError('Native receiver unavailable')) as native, \
             patch.object(installer,'WindowsRegistry',return_value=self.registry), \
             patch.object(installer.sys,'platform','win32'):
            self.assertEqual(installer.main(['--restore-launcher']),0)
            native.assert_not_called()
        self.assertEqual(self.registry.current,self.old)
    def test_redirected_visits_parent_is_rejected_at_runtime_and_restore(self):
        result=self.install();bundle=Path(result['bundle'])
        visits=self.root/'visits';relocated=Path(self.tmp.name)/'relocated'
        visits.rename(relocated)
        if os.name=='nt':
            subprocess.run(['cmd','/c','mklink','/J',str(visits),str(relocated)],capture_output=True,check=True)
        else:visits.symlink_to(relocated,target_is_directory=True)
        code="import runpy,sys;e=runpy.run_path(sys.argv[1]);e['verify_bundle']()"
        p=subprocess.run([sys.executable,'-I','-B','-c',code,str(bundle/'office_entry.py')],
            capture_output=True,text=True,encoding='utf-8',timeout=10)
        self.assertNotEqual(p.returncode,0)
        with self.assertRaises(RuntimeError):
            installer.restore_launcher(HERE,self.root,self.registry,self.interpreter)
    def test_bootstrap_redirect_is_checked_before_dispatch(self):
        bundle=installer.prepare_bundle(HERE,self.root/'visits')
        entry=runpy.run_path(str(bundle/'office_entry.py'))
        original=Path.is_symlink
        with patch.object(Path,'is_symlink',lambda path:path.name=='office_entry.py' or original(path)):
            with self.assertRaises(RuntimeError):entry['verify_bundle']()
    def test_registered_missing_bundle_is_not_silently_recreated(self):
        result=self.install();bundle=Path(result['bundle']);writes=len(self.registry.writes)
        shutil.rmtree(bundle)
        with self.assertRaises(RuntimeError):self.install()
        self.assertFalse(bundle.exists());self.assertEqual(len(self.registry.writes),writes)
    def test_idempotent_install_reaudits_registration_after_file_verification(self):
        self.install();before=len(self.registry.writes);original=installer._verify_files
        foreign=installer.Registration('Foreign','changed "%1"')
        def changed_after_verification(*args):
            original(*args);self.registry.current=foreign
        with patch.object(installer,'_verify_files',side_effect=changed_after_verification):
            with self.assertRaises(RuntimeError):self.install()
        self.assertEqual(self.registry.current,foreign);self.assertEqual(len(self.registry.writes),before)
    def test_valid_open_and_visit_dispatch_only_existing_fixed_entrypoints(self):
        bundle=installer.prepare_bundle(HERE,self.root/'visits')
        code=r"""
import runpy,sys
from unittest.mock import patch
e=runpy.run_path(sys.argv[1]);b=e['verify_bundle']();sys.path.insert(0,str(b))
import office_launcher,office_visit
with patch.object(office_launcher,'main',return_value=0) as opened,patch.object(office_visit,'main',return_value=0) as visited:
 for uri in ['omnira-office://open','omnira-office://open/']:
  assert e['main']([uri])==0;opened.assert_called_with(['--open',uri])
 for uri in ['omnira-office://visit','omnira-office://visit/']:
  assert e['main']([uri])==0;visited.assert_called_with(['--visit'])
 assert opened.call_count==2 and visited.call_count==2
print('fixed_dispatch_ok')
"""
        p=subprocess.run([sys.executable,'-I','-c',code,str(bundle/'office_entry.py')],capture_output=True,text=True,encoding='utf-8',timeout=10)
        self.assertEqual(p.returncode,0,p.stderr);self.assertIn('fixed_dispatch_ok',p.stdout)

if __name__=='__main__':unittest.main()
