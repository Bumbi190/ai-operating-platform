"""Synthetic file-integrity receipts only; no actual Unreal acceptance is asserted."""
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from office_install_guard import canonical,digest,OwnedInstallTransaction
from office_workflow_native_guard import check_workflow_native,SOURCES,FOLDER,ASSET,CHECKS,OFFICE_MAP
import office_workflow_visit

class NativeGuardTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)/'project';self.source=Path(self.tmp.name)/'source'
        self.folder=self.root/FOLDER;self.folder.mkdir(parents=True);self.source.mkdir()
        self.target=SimpleNamespace(project=self.root/'fixture.uproject',verify=lambda:None)
        self.paths={'project':self.target.project,'map':self.root/('Content'+OFFICE_MAP[5:]+'.umap'),'asset':self.root/('Content'+ASSET[5:]+'.uasset')}
        self.paths['dependency:'+ASSET]=self.paths['asset']
        self.paths.update({'source:'+n:self.source/n for n in SOURCES})
        for path in self.paths.values():path.parent.mkdir(parents=True,exist_ok=True);path.write_text('synthetic fixture; not an Unreal asset')
        artifacts={n:digest(p) for n,p in self.paths.items()}
        self.receipt={'scope':'canonical_saved_workflow_v1','installed':True,'passed':True,'workflow_protocol':1,'map':OFFICE_MAP,'asset':ASSET,'projection_directory':str(self.root/'Saved/OfficePresence'),'artifacts':artifacts,'finalizer_pid':100,'packages':[ASSET]}
        for name,pid in [('audit',101),('runtime',102)]:
            proof={'scope':'canonical_saved_workflow_v1','passed':True,'pid':pid,'artifacts':artifacts,'packages':[ASSET],'dependency_closure_verified':True,**{n:True for n in CHECKS}}
            (self.folder/(name+'.json')).write_text(json.dumps(proof));self.receipt[name+'_sha256']=digest(self.folder/(name+'.json'))
        self.save()
    def save(self):
        receipt=self.folder/'installation.json';receipt.write_text(json.dumps(self.receipt))
        records={}
        for name,path in self.paths.items():
            if name.startswith('source:'):continue
            backup=self.folder/('original_'+name.replace(':','_').replace('/','_')+path.suffix);backup.write_bytes(path.read_bytes())
            records[canonical(path)]={'before':digest(backup),'backup':str(backup),'observed_after':digest(path)}
        records[canonical(receipt)]={'before':None,'backup':None,'observed_after':digest(receipt)}
        state={'schema':OwnedInstallTransaction.SCHEMA,'status':'committed','records':records,'order':list(records)}
        (self.folder/'transaction.json').write_text(json.dumps(state))
    def test_complete_synthetic_integrity_fixture_is_accepted(self):
        self.assertEqual(check_workflow_native(self.target,self.source),self.root/'Saved/OfficePresence')
    def test_preview_scope_boolean_version_and_incomplete_runtime_are_rejected(self):
        for values in ({'scope':'test_only'},{'installed':False},{'workflow_protocol':True},{'map':'/Game/Preview'}):
            original=dict(self.receipt);self.receipt.update(values);self.save()
            with self.assertRaises(ValueError):check_workflow_native(self.target,self.source)
            self.receipt=original
    def test_changed_source_asset_or_proof_and_missing_map_backup_reject(self):
        for path in (self.source/SOURCES[0],self.paths['asset'],self.folder/'runtime.json',self.folder/'original_map.umap'):
            before=path.read_bytes();path.write_text('changed')
            with self.assertRaises(ValueError):check_workflow_native(self.target,self.source)
            path.write_bytes(before)
    def test_missing_artifact_cannot_match_null_expected_hash(self):
        self.paths['asset'].unlink();self.receipt['artifacts']['asset']=None;(self.folder/'installation.json').write_text(json.dumps(self.receipt))
        with self.assertRaises((ValueError,FileNotFoundError)):check_workflow_native(self.target,self.source)
    def test_cli_missing_real_receipt_refuses_before_process_or_listener(self):
        (self.folder/'installation.json').unlink()
        with patch('office_launcher.default_target',return_value=self.target),patch('office_visit_process.acquire_office_process') as acquire,patch('office_visit_relay.OfficeVisitRelay') as relay,patch('builtins.print'):
            self.assertEqual(office_workflow_visit.main(['--workflow-visit']),1)
            acquire.assert_not_called();relay.assert_not_called()
        self.assertFalse((self.root/'Saved/OfficePresence').exists())
    def test_cli_has_no_url_command_or_source_override(self):
        with patch('builtins.print'):
            for args in ([],['--workflow-visit','https://other.invalid'],['--visit'],['--workflow-visit','--command','anything']):self.assertEqual(office_workflow_visit.main(args),1)

if __name__=='__main__':unittest.main()
