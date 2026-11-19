from pathlib import Path
import unittest
from unittest.mock import patch
import tempfile
import json
import hashlib
from types import SimpleNamespace

class NativeActivityContract(unittest.TestCase):
    def test_separate_versioned_consumer_source_exists(self):
        source=Path(__file__).with_name('office_activity_native.py')
        self.assertTrue(source.is_file(),'Versioned native activity authoring missing')
        text=source.read_text('utf-8')
        for term in ['omnira.office.private-presence.v2','ActivityDeadline','ActivityInvalidated','activity_expires_at_unix','Stegbegäran registrerad · körning ej verifierad']:
            self.assertIn(term,text)
        self.assertNotIn('save_current_level(',text,'Local candidate must not install into live map')

    def test_missing_receipt_does_not_advertise_activity(self):
        import office_activity
        self.assertTrue(hasattr(office_activity,'check_activity_native'),'Native activity readiness check missing')
        with tempfile.TemporaryDirectory() as tmp:
            target=SimpleNamespace(project=Path(tmp)/'office.uproject')
            self.assertIsNone(office_activity.check_activity_native(target))

    def test_bad_receipt_fails_closed_instead_of_falling_back(self):
        import office_activity
        self.assertTrue(hasattr(office_activity,'check_activity_native'),'Native activity readiness check missing')
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);receipt=root/'Saved/OfficeActivitySetup/installation.json';receipt.parent.mkdir(parents=True);receipt.write_text('{"installed":true}')
            with self.assertRaises(ValueError):office_activity.check_activity_native(SimpleNamespace(project=root/'office.uproject'))

    def test_hash_only_receipt_cannot_skip_independent_binding_and_material_audit(self):
        import office_activity
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);project=root/'office.uproject';project.write_text('{}')
            world=root/'Content/OmniraRealismLab/Maps/Omnira_HQ_Office_Visit.umap';world.parent.mkdir(parents=True);world.write_bytes(b'map')
            asset=root/'Content/OmniraGameplayV83/PrivatePresence/BP_OfficeStepActivity.uasset';asset.parent.mkdir(parents=True);asset.write_bytes(b'asset')
            files={'project_sha256':project,'map_sha256':world,'asset_sha256':asset,'source_sha256':Path(office_activity.__file__).with_name('office_activity_native.py'),'receiver_sha256':Path(office_activity.__file__)}
            data={k:hashlib.sha256(p.read_bytes()).hexdigest() for k,p in files.items()}
            data.update(schema='omnira.office.activity-install.v1',installed=True,saved_receiver_verified=True,runtime_pause_expiry_verified=True,avatar_id='office-familje-pling',projection_schema=office_activity.SCHEMA)
            receipt=root/'Saved/OfficeActivitySetup/installation.json';receipt.parent.mkdir(parents=True);receipt.write_text(json.dumps(data))
            with self.assertRaises(ValueError):office_activity.check_activity_native(SimpleNamespace(project=project))

if __name__=='__main__':unittest.main()
