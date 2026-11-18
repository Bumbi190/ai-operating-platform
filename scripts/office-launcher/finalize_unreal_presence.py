"""Fresh-process installed-state audit; no fixture writes, map saves or task calls."""
from pathlib import Path
import importlib.util,json,traceback
import unreal as u
spec=importlib.util.spec_from_file_location('office_native_installer',Path(__file__).with_name('install_unreal_presence.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.assert_context();m.assert_exclusive_editor()  # Before writes or level loads.
from office_install_guard import verify_artifacts,atomic_bytes
proof={'installed':False,'real_auth':False,'live_execution':False,'fresh_process':True,'saved_assets':False}
failure=None
try:
 manifest=json.loads(m.INSTALL_MANIFEST.read_text(encoding='utf-8'))
 verify_artifacts(manifest,source=Path(m.__file__),asset=m.ASSET_FILE,project=m.PROJECT_FILE)
 assert u.get_editor_subsystem(u.LevelEditorSubsystem).load_level(m.MAP)
 m.assert_context(loaded=True)
 baseline=json.loads((m.OUT/'actors_before.json').read_text(encoding='utf-8'))
 proof.update(m.verify_presence_actor(baseline))
 if manifest.get('presentation'):
  import style_unreal_presence as style
  actor=next(a for a in u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors() if 'OfficePresenceOwned' in [str(t) for t in a.tags])
  proof['presentation']=style.verify(actor,manifest)
 runtime=json.loads((m.OUT/'runtime_expiry_proof.json').read_text(encoding='utf-8'))
 assert runtime.get('passed') is True and runtime.get('uses_installed_actor') is True,'Real installed-actor PIE proof required'
 assert not runtime.get('cleanup_errors'),'Runtime proof cleanup failed'
 assert runtime.get('map_unchanged_before_exit') is True
 assert runtime.get('map_before_sha256')==m.sha(m.MAP_FILE),'Map changed after the runtime acceptance proof'
 assert runtime.get('native_tick_enabled') is True and runtime.get('tick_when_paused') is True
 assert runtime.get('fresh_seen_on_real_tick') is True and runtime.get('expiry_seen_without_writer') is True
 proof.update(installed=True,status='verified_local_identity_consumer',passed=True,
  map_sha256=m.sha(m.MAP_FILE),asset_sha256=m.sha(m.ASSET_FILE),source_sha256=m.sha(Path(m.__file__)),
  backend_authenticated=False,voice_connected=False,workflow_execution_verified=False)
 manifest.update(installed=True,status='verified_local_identity_consumer',fresh_process_verified=True,
  runtime_pause_expiry_verified=True,map_after_sha256=m.sha(m.MAP_FILE))
 atomic_bytes(m.INSTALL_MANIFEST,(json.dumps(manifest,indent=2)+'\n').encode('utf-8'))
except Exception as error:failure=error;proof['error']=traceback.format_exc()
atomic_bytes(m.OUT/'fresh_process_audit.json',(json.dumps(proof,indent=2)+'\n').encode('utf-8'))
print(json.dumps(proof))
if failure:raise RuntimeError('Installed-state verification failed') from failure
