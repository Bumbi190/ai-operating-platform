"""Pure canonical saved-receiver integrity gate. No Unreal/network/process calls."""
from pathlib import Path
import json,re,os,ast,hashlib
from office_install_guard import digest,canonical
from office_activity_stage_guard import validate_stage

SCHEMA='canonical_saved_activity_v1'
FOLDER='Saved/OfficeActivityInstall'
ASSET='/Game/OmniraGameplayV83/PrivateStepActivity/BP_OfficeStepActivity'
MAP='/Game/OmniraRealismLab/Maps/Omnira_HQ_Office_Visit'
MATERIAL='/Game/OmniraGameplayV83/PrivatePresence/M_OfficePresenceText'
FONT='/Engine/EngineFonts/RobotoDistanceField'
PACKAGES=(ASSET,MATERIAL,FONT)
SOURCES=('office_activity_install.py','install_office_activity.py','verify_office_activity_install_runtime.py',
 'office_activity_stage.py','office_activity_stage_guard.py','office_activity_native.py',
 'install_unreal_presence.py','office_install_guard.py','office_activity.py','office_pairing.py','style_unreal_presence.py')
RUNTIME_MODULES=('office_launcher.py','office_install_guard.py','office_pairing.py','office_presence.py','office_relay.py',
 'office_visit.py','office_visit_client.py','office_visit_process.py','office_visit_relay.py','office_activity.py',
 'office_activity_native.py','install_unreal_presence.py','style_unreal_presence.py','office_activity_install.py',
 'install_office_activity.py','verify_office_activity_install_runtime.py','office_activity_stage.py','office_activity_stage_guard.py')

def bundle_identity(source):
 source=Path(source);bootstrap=(source/'office_entry.py').read_bytes();tree=ast.parse(bootstrap)
 def value(name):
  node=next(n for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id==name for t in n.targets))
  return ast.literal_eval(node.value)
 if value('_MODULES')!=set(RUNTIME_MODULES):raise ValueError('Bundle module policy differs')
 payloads={name:(source/name).read_bytes() for name in RUNTIME_MODULES}
 expected=value('_EXPECTED');hashes={n:hashlib.sha256(data).hexdigest() for n,data in payloads.items()}
 if expected=={}:
  marker=b'_EXPECTED = {}'
  if bootstrap.count(marker)!=1:raise ValueError('Bootstrap template differs')
  bootstrap=bootstrap.replace(marker,b'_EXPECTED = '+json.dumps(hashes,sort_keys=True).encode('ascii'),1)
 elif expected!=hashes or set(p.name for p in source.iterdir())!=set(RUNTIME_MODULES)|{'office_entry.py'}:raise ValueError('Installed bundle differs')
 payloads['office_entry.py']=bootstrap
 records={n:hashlib.sha256(data).hexdigest() for n,data in payloads.items()}
 return hashlib.sha256(json.dumps(records,sort_keys=True).encode('ascii')).hexdigest()

def transaction_paths(target):
 root=target.project.parent
 return [root/'Content'/(MAP[6:]+s) for s in ('.umap','.uexp','.ubulk')]+[root/'Content'/(ASSET[6:]+s) for s in ('.uasset','.uexp','.ubulk')]+[root/FOLDER/n for n in ('candidate.json','actors_before.json','installation.json')]

def verify_committed(target,receipt_path):
 folder=target.project.parent/FOLDER;state=json.loads((folder/'transaction.json').read_text('utf-8'))
 from office_install_guard import OwnedInstallTransaction
 scope={canonical(p) for p in transaction_paths(target)}
 if state.get('schema')!=OwnedInstallTransaction.SCHEMA or state.get('status')!='committed' or set(state.get('records',{}))!=scope or set(state.get('order',[]))!=scope:raise ValueError('Native transaction not committed in exact scope')
 map_paths={canonical(target.project.parent/'Content'/(MAP[6:]+s)):folder/('original_map'+s) for s in ('.umap','.uexp','.ubulk')}
 if state['records'][canonical(target.project.parent/'Content'/(MAP[6:]+'.umap'))].get('before') is None:raise ValueError('Original canonical map backup missing')
 for path,record in state['records'].items():
  if digest(path)!=record.get('observed_after'):raise ValueError('Committed transaction artifact changed')
  backup=record.get('backup')
  if record.get('before') is not None and (path not in map_paths or backup is None or canonical(backup)!=canonical(map_paths[path])):raise ValueError('Original backup scope differs')
  if backup is not None and (canonical(Path(backup).parent)!=canonical(folder) or digest(backup)!=record.get('before')):raise ValueError('Rollback backup unavailable')
 if state['records'][canonical(receipt_path)].get('observed_after')!=digest(receipt_path):raise ValueError('Receipt was not committed')

def paths_for(target,source,packages):
 if not isinstance(packages,(list,tuple)) or len(packages)!=len(set(packages)) or not set(PACKAGES).issubset(packages):raise ValueError('Presentation package set incomplete')
 project=target.project.parent;engine=target.engine.parents[2]/'Content'
 result={'map':project/'Content'/(MAP[6:]+'.umap'),'blueprint':project/'Content'/(ASSET[6:]+'.uasset'),
  'project':target.project,'baseline':project/FOLDER/'actors_before.json'}
 result.update({'source:'+name:Path(source)/name for name in SOURCES})
 for package in packages:
  if not isinstance(package,str) or not re.fullmatch(r'/(Game|Engine)/(?:[A-Za-z0-9_]+/)*[A-Za-z0-9_]+',package):raise ValueError('Invalid dependency package')
  root=project/'Content' if package.startswith('/Game/') else engine
  relative=package.split('/',2)[2]
  file=root/(relative+'.uasset')
  if not canonical(file).startswith(canonical(root)+os.sep):raise ValueError('Redirected dependency')
  result['dependency:'+package+'.uasset']=file
 for key,path in list(result.items()):
  if key in ('map','blueprint') or key.startswith('dependency:'):
   for suffix in ('.uexp','.ubulk'):
    side=path.with_suffix(suffix)
    if side.exists():result[key+suffix]=side
 return result

def validate_canonical(target,source,receipt,candidate,audit,runtime):
 if receipt.get('scope')!=SCHEMA or receipt.get('installed') is not True or receipt.get('passed') is not True or candidate.get('scope')!=SCHEMA or candidate.get('installed') is not False:raise ValueError('Canonical installation is not finalized')
 output=target.project.parent/'Saved/OfficePresence'
 for proof in (candidate,receipt):
  if canonical(proof.get('projection_directory',''))!=canonical(output):raise ValueError('Wrong canonical projection binding')
 if receipt.get('packages')!=candidate.get('packages') or receipt.get('artifacts')!=candidate.get('artifacts') or receipt.get('run_id')!=candidate.get('run_id'):raise ValueError('Final evidence differs')
 if candidate.get('bundle_id')!=receipt.get('bundle_id') or receipt.get('bundle_id')!=bundle_identity(source):raise ValueError('Entire prepared bundle changed')
 if audit.get('legacy_v1_exact') is not True or runtime.get('fresh_seen_on_real_tick') is not True:raise ValueError('Legacy or positive native tick proof missing')
 pid=receipt.get('finalizer_pid')
 if type(pid) is not int or pid<=0 or pid in (candidate.get('build_pid'),audit.get('pid'),runtime.get('pid')):raise ValueError('Independent finalizer required')
 paths=paths_for(target,source,candidate['packages'])
 validate_stage({**candidate,'scope':'isolated_saved_stage_v1','installed':False},audit,runtime,paths)
 config=json.loads(target.project.read_text('utf-8-sig'))
 plugins=[p for p in config.get('Plugins',[]) if p.get('Name')=='JsonBlueprintUtilities']
 if len(plugins)!=1 or plugins[0].get('Enabled') is not True:raise ValueError('Runtime JSON plugin not verified')
 return output

def check_canonical(target,source):
 target.verify();folder=target.project.parent/FOLDER
 verify_committed(target,folder/'installation.json')
 receipt=json.loads((folder/'installation.json').read_text('utf-8'))
 proofs=[]
 for name,key in (('candidate.json','candidate_sha256'),('audit.json','audit_sha256'),('runtime-activity-proof.json','runtime_sha256')):
  path=folder/name
  if receipt.get(key)!=digest(path):raise ValueError('Independent proof changed')
  proofs.append(json.loads(path.read_text('utf-8')))
 return validate_canonical(target,source,receipt,*proofs)
