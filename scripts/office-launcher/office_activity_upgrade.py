"""Exact known-revision immutable visit bundle upgrade; explicit CLI only."""
from pathlib import Path
import ast,hashlib,json,subprocess,sys,re
import office_entry_install as entry
from office_install_guard import atomic_bytes

PREVIOUS='03977982c0c33bd3c5ff08c37ae30e88c1009e21'
PREVIOUS_BUNDLE='49982da36c6db5d030539f0b04293f8714878d04b6fa46da0ad1e223a6b3e5ba'

def previous_payloads(repo):
 def read(name):
  return subprocess.run(['git','show',PREVIOUS+':scripts/office-launcher/'+name],cwd=repo,check=True,capture_output=True).stdout
 tree=ast.parse(read('office_entry_install.py'))
 assignment=next(n for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='MODULES' for t in n.targets))
 names=ast.literal_eval(assignment.value)
 if not isinstance(names,tuple) or any(not isinstance(n,str) or Path(n).name!=n or not n.endswith('.py') for n in names):raise ValueError('Unrecognized prior bundle')
 payloads={name:read(name) for name in (*names,'office_entry.py')}
 hashes={name:hashlib.sha256(payloads[name]).hexdigest() for name in names}
 marker=b'_EXPECTED = {}'
 if payloads['office_entry.py'].count(marker)!=1:raise ValueError('Prior entry template changed')
 payloads['office_entry.py']=payloads['office_entry.py'].replace(marker,b'_EXPECTED = '+json.dumps(hashes,sort_keys=True).encode('ascii'),1)
 return payloads

def verify_prior_payloads(expected,actual,pinned_id):
 if set(actual)!=set(expected) or entry._bundle_id(actual)!=pinned_id:raise ValueError('Prior bundle bytes do not match pinned identity')
 normalize=lambda data:data.replace(b'\r\n',b'\n')
 names=set(expected)-{'office_entry.py'}
 if any(normalize(actual[n])!=normalize(expected[n]) for n in names):raise ValueError('Prior code differs from reviewed revision')
 old_hashes={n:hashlib.sha256(expected[n]).hexdigest() for n in names}
 actual_hashes={n:hashlib.sha256(actual[n]).hexdigest() for n in names}
 marker=b'_EXPECTED = '+json.dumps(old_hashes,sort_keys=True).encode('ascii')
 if expected['office_entry.py'].count(marker)!=1:raise ValueError('Unrecognized prior bootstrap')
 rendered=expected['office_entry.py'].replace(marker,b'_EXPECTED = '+json.dumps(actual_hashes,sort_keys=True).encode('ascii'),1)
 if normalize(rendered)!=normalize(actual['office_entry.py']):raise ValueError('Prior bootstrap differs')

def prepare(source,root,registry,interpreter,repo):
 expected=previous_payloads(repo);old_bundle=root/'visits'/PREVIOUS_BUNDLE
 if not old_bundle.is_dir() or set(p.name for p in old_bundle.iterdir())!=set(expected):raise ValueError('Prior bundle content differs')
 old_payloads={name:(old_bundle/name).read_bytes() for name in expected}
 verify_prior_payloads(expected,old_payloads,PREVIOUS_BUNDLE)
 old=entry.Registration(entry.VISIT_OWNER,entry.visit_command(old_bundle,interpreter))
 new_payloads=entry.build_payloads(source);new_bundle=root/'visits'/entry._bundle_id(new_payloads)
 new=entry.Registration(entry.VISIT_OWNER,entry.visit_command(new_bundle,interpreter))
 current=entry._audit(registry,(old,new))
 entry._verify_files(old_bundle,old_payloads)
 prepared=entry.prepare_bundle(source,root/'visits')
 if prepared!=new_bundle:raise ValueError('Prepared bundle identity mismatch')
 return old,new,new_bundle

def activate(source,root,registry,interpreter,repo):
 old,new,bundle=prepare(source,root,registry,interpreter,repo)
 from office_activity_install import check_canonical
 from office_launcher import default_target
 check_canonical(default_target(),bundle)
 current=entry._audit(registry,(old,new))
 record={'schema':'office_activity_upgrade_v1','old_id':PREVIOUS_BUNDLE,'new_id':bundle.name,
  'interpreter':str(interpreter),'old_command':old.command,'new_command':new.command}
 path=root/'activity_upgrade.json'
 if path.exists() and json.loads(path.read_text('utf-8'))!=record:raise ValueError('Existing upgrade record differs; preserving it')
 atomic_bytes(path,json.dumps(record,indent=2).encode('utf-8'))
 entry._switch(registry,current,new)
 return {'bundle':str(bundle),'previous_command':old.command,'current_command':new.command,'scope':'current_user'}

def restore(source,root,registry,interpreter,repo):
 restore_record(root,registry)

def restore_record(root,registry):
 record=json.loads((root/'activity_upgrade.json').read_text('utf-8'))
 if record.get('schema')!='office_activity_upgrade_v1' or record.get('old_id')!=PREVIOUS_BUNDLE or not re.fullmatch('[0-9a-f]{64}',record.get('new_id','')):raise ValueError('Upgrade record invalid')
 interpreter=Path(record['interpreter'])
 if not interpreter.is_file():raise ValueError('Original interpreter missing')
 old_bundle=root/'visits'/record['old_id'];new_bundle=root/'visits'/record['new_id']
 old=entry.Registration(entry.VISIT_OWNER,entry.visit_command(old_bundle,interpreter))
 new=entry.Registration(entry.VISIT_OWNER,entry.visit_command(new_bundle,interpreter))
 if record['old_command']!=old.command or record['new_command']!=new.command:raise ValueError('Upgrade commands differ')
 current=entry._audit(registry,(old,new))
 def verify(bundle,pinned):
  payloads={p.name:p.read_bytes() for p in bundle.iterdir()}
  entry._verify_files(bundle,payloads)
  if entry._bundle_id(payloads)!=pinned:raise ValueError('Pinned immutable bundle changed')
 verify(old_bundle,record['old_id'])
 # Missing upgraded content may be recovered by returning to the known old
 # registration. Existing edited content is preserved and requires inspection.
 if new_bundle.exists():verify(new_bundle,record['new_id'])
 entry._switch(registry,current,old)

def main(args):
 if args not in (['--prepare'],['--activate'],['--restore']):raise ValueError('Explicit fixed upgrade action required')
 from office_launcher import install_dir
 source=Path(__file__).resolve().parent;repo=source.parents[1]
 registry=entry.WindowsRegistry();interpreter=Path(sys.executable).with_name('pythonw.exe')
 if args!=['--restore'] and not interpreter.is_file():raise ValueError('Expected Python missing')
 if args==['--prepare']:
  old,new,bundle=prepare(source,install_dir(),registry,interpreter,repo)
  result={'status':'prepared','bundle':str(bundle),'active':False}
 elif args==['--activate']:result=activate(source,install_dir(),registry,interpreter,repo)
 else:restore(source,install_dir(),registry,interpreter,repo);result={'status':'restored'}
 print(json.dumps(result))

if __name__=='__main__':main(sys.argv[1:])
