"""Immutable bundle and fixed target boundaries; no actual installation claimed."""
from pathlib import Path
import tempfile,unittest
from office_workflow_bundle import prepare,verify_bundle,MODULES,ENTRY
from office_workflow_target import WorkflowTarget,WORKFLOW_MAP,matching_workflow
from office_launcher import OfficeTarget,RunningOffice,matching_office

class WorkflowBundleTests(unittest.TestCase):
    def test_prepare_is_immutable_and_keeps_unrelated_bundles(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);src=root/'source';src.mkdir();dest=root/'bundles'
            for n in MODULES:(src/n).write_text('# test fixture '+n+'\n')
            (src/ENTRY).write_text('_EXPECTED = {}\n')
            bundle=prepare(src,dest);self.assertEqual(verify_bundle(bundle),bundle);self.assertEqual(prepare(src,dest),bundle)
            (bundle/MODULES[0]).write_text('edited')
            with self.assertRaises(ValueError):prepare(src,dest)
            self.assertEqual((bundle/MODULES[0]).read_text(),'edited')
    def test_bootstrap_changes_and_unknown_files_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            src=Path(tmp)/'source';src.mkdir()
            for n in MODULES:(src/n).write_text('# fixture\n')
            (src/ENTRY).write_text('_EXPECTED = {}\n');bundle=prepare(src,Path(tmp)/'bundles')
            (bundle/'extra.py').write_text('unknown')
            with self.assertRaises(ValueError):verify_bundle(bundle)
            (bundle/'extra.py').unlink();(bundle/ENTRY).write_text('_EXPECTED = {}\n')
            with self.assertRaises(ValueError):verify_bundle(bundle)
    def test_target_does_not_reuse_legacy_editor_or_extra_flags(self):
        t=WorkflowTarget(Path('engine.exe'),Path('project.uproject'));p=RunningOffice(123,t.argv())
        self.assertTrue(matching_workflow(p,t));self.assertFalse(matching_office(p,OfficeTarget(t.engine,t.project)))
        self.assertFalse(matching_workflow(RunningOffice(123,OfficeTarget(t.engine,t.project).argv()),t))
        for extra in ('-ExecCmds=anything','-run=pythonscript','https://other.invalid'):
            self.assertFalse(matching_workflow(RunningOffice(123,p.argv+[extra]),t))
        self.assertEqual(t.argv()[2],WORKFLOW_MAP)

if __name__=='__main__':unittest.main()
