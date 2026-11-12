"""Real filesystem failure-injection checks; no Unreal or user project is modified."""
import importlib.util,json
from pathlib import Path
import tempfile,unittest
from unittest.mock import patch
try:
 import office_install_guard as guard
except ImportError:guard=None

class InstallGuardTests(unittest.TestCase):
 def setUp(self):
  self.assertIsNotNone(guard,'Native installation safety guard is missing')
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
  self.root=Path(self.tmp.name)
  self.project=self.root/'v83/Office.uproject';self.project.parent.mkdir();self.project.write_text('{}')
  self.content=self.project.parent/'Content';self.content.mkdir()
  self.map=self.content/'Maps/Office.umap';self.map.parent.mkdir();self.map.write_bytes(b'original-map')
  self.asset=self.content/'Private/BP_Presence.uasset';self.asset.parent.mkdir()

 def test_exact_project_content_world_and_active_level_are_required(self):
  args=dict(active_project=self.project,active_content=self.content,expected_project=self.project,
   expected_map_file=self.map,map_package='/Game/Maps/Office',world_path='/Game/Maps/Office.Office',
   level_path='/Game/Maps/Office.Office:PersistentLevel')
  guard.validate_context(**args)
  other=self.root/'sibling/Office.uproject';other.parent.mkdir();other.write_text('{}')
  for key,value in [('active_project',other),('active_content',other.parent/'Content'),
                    ('world_path','/Game/Maps/Other.Other'),('level_path','/Game/Maps/Other.Other:PersistentLevel')]:
   with self.subTest(key=key),self.assertRaises(guard.GuardError):guard.validate_context(**{**args,key:value})
  self.assertEqual(self.map.read_bytes(),b'original-map')

 def test_unacquired_or_failed_snapshot_fixture_never_deletes_live_projection(self):
  file=self.root/'avatar.json';file.write_bytes(b'live-projection')
  first=guard.ProjectionFixture(file);first.acquire()
  try:
   second=guard.ProjectionFixture(file)
   with self.assertRaises(guard.GuardError):second.acquire()
   second.restore()
   self.assertEqual(file.read_bytes(),b'live-projection')
  finally:first.restore()
  third=guard.ProjectionFixture(file)
  with patch.object(Path,'read_bytes',side_effect=OSError('snapshot failure')):
   with self.assertRaises(OSError):third.acquire()
  third.restore()
  self.assertEqual(file.read_bytes(),b'live-projection')

 def test_fixture_restores_original_or_absence_and_releases_lease(self):
  for original in [b'original',None]:
   file=self.root/'fixture.json'
   if original is None:file.unlink(missing_ok=True)
   else:file.write_bytes(original)
   fixture=guard.ProjectionFixture(file);fixture.acquire();fixture.write(b'synthetic')
   fixture.remove();fixture.write(b'new-synthetic');fixture.restore()
   self.assertEqual(file.read_bytes() if file.exists() else None,original)
   again=guard.ProjectionFixture(file);again.acquire();again.restore()

 def test_fixture_does_not_overwrite_unexpected_external_change(self):
  file=self.root/'fixture.json';file.write_bytes(b'original')
  fixture=guard.ProjectionFixture(file);fixture.acquire();fixture.write(b'synthetic')
  file.write_bytes(b'external-change')
  with self.assertRaises(guard.GuardError):fixture.restore()
  self.assertEqual(file.read_bytes(),b'external-change')
  again=guard.ProjectionFixture(file);again.acquire();again.restore()

 def transaction(self,name):
  folder=self.root/name;folder.mkdir()
  backup_map=folder/'before.umap';backup_map.write_bytes(self.map.read_bytes())
  backup_project=folder/'before.uproject';backup_project.write_bytes(self.project.read_bytes())
  return guard.OwnedInstallTransaction(folder/'journal.json',
   originals={self.map:backup_map,self.project:backup_project},new_files=[self.asset],
   rollback_order=[self.map,self.asset,self.project])

 def test_failure_after_every_save_boundary_rolls_back_only_owned_changes(self):
  for failure in range(3):
   tx=self.transaction('failure'+str(failure));tx.begin()
   steps=[('config',[self.project],lambda:guard.atomic_bytes(self.project,b'{"plugin":true}')),
          ('asset',[self.asset],lambda:self.asset.write_bytes(b'new-asset')),
          ('map',[self.map],lambda:self.map.write_bytes(b'new-map'))]
   with self.assertRaises(RuntimeError):
    try:
     for index,(name,paths,action) in enumerate(steps):
      def injected(action=action,index=index):
       action()
       if index==failure:raise RuntimeError('Injected save-boundary failure')
      tx.step(name,paths,injected)
    except Exception:
     tx.rollback();raise
   self.assertEqual(self.map.read_bytes(),b'original-map')
   self.assertEqual(self.project.read_bytes(),b'{}')
   self.assertFalse(self.asset.exists())
   self.assertEqual(json.loads(tx.journal.read_text())['status'],'rolled_back')

 def test_journal_recovers_recorded_interruption_and_refuses_unknown_drift(self):
  tx=self.transaction('recover');tx.begin()
  tx.step('asset',[self.asset],lambda:self.asset.write_bytes(b'owned-asset'))
  guard.OwnedInstallTransaction.recover(tx.journal,allowed_files=[self.map,self.project,self.asset])
  self.assertFalse(self.asset.exists())
  tx=self.transaction('conflict');tx.begin()
  tx.step('map',[self.map],lambda:self.map.write_bytes(b'owned-map'))
  self.map.write_bytes(b'parallel-edit')
  with self.assertRaises(guard.GuardError):guard.OwnedInstallTransaction.recover(tx.journal,allowed_files=[self.map,self.project,self.asset])
  self.assertEqual(self.map.read_bytes(),b'parallel-edit')

 def test_cleanup_failure_still_restores_fixture_and_cannot_report_pass(self):
  self.assertTrue(callable(getattr(guard,'finish_checks',None)),'Independent cleanup verification is missing')
  file=self.root/'live.json';file.write_bytes(b'original')
  fixture=guard.ProjectionFixture(file);fixture.acquire();fixture.write(b'synthetic')
  proof={'passed':True}
  def failed_unpause():raise RuntimeError('Injected PIE teardown failure')
  guard.finish_checks(proof,[('unpause',failed_unpause),('restore',fixture.restore),('map_unchanged',lambda:True)])
  self.assertFalse(proof['passed']);self.assertEqual(file.read_bytes(),b'original')
  again=guard.ProjectionFixture(file);again.acquire();again.restore()
  second={'passed':True};guard.finish_checks(second,[('map_unchanged',lambda:False)])
  self.assertFalse(second['passed'])

 def test_saved_artifact_hash_and_required_plugin_are_revalidated(self):
  self.assertTrue(callable(getattr(guard,'verify_artifacts',None)),'Saved artifact validation is missing')
  source=self.root/'install.py';source.write_text('source')
  self.asset.write_bytes(b'owned-asset')
  self.project.write_text('{"Plugins":[{"Name":"JsonBlueprintUtilities","Enabled":true}]}')
  manifest={'source_sha256':guard.digest(source),'asset_sha256':guard.digest(self.asset)}
  guard.verify_artifacts(manifest,source=source,asset=self.asset,project=self.project)
  self.map.write_bytes(b'unrelated valid map edit')
  guard.verify_artifacts(manifest,source=source,asset=self.asset,project=self.project)
  self.asset.write_bytes(b'modified-asset')
  with self.assertRaises(guard.GuardError):guard.verify_artifacts(manifest,source=source,asset=self.asset,project=self.project)
  self.asset.write_bytes(b'owned-asset')
  self.project.write_text('{"Plugins":[{"Name":"JsonBlueprintUtilities","Enabled":false}]}')
  with self.assertRaises(guard.GuardError):guard.verify_artifacts(manifest,source=source,asset=self.asset,project=self.project)

if __name__=='__main__':unittest.main()
