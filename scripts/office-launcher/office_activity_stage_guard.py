"""Offline evidence gate. A staging receipt can NEVER enable the live launcher."""
from office_install_guard import digest

def dependency_closure(roots,lookup):
 pending=list(roots);seen=set()
 if not pending:raise ValueError('Presentation roots missing')
 while pending:
  package=str(pending.pop())
  if package.startswith('/Script/') or package in seen:continue
  if not package.startswith(('/Game/','/Engine/')):raise ValueError('Unreviewed dependency mount')
  seen.add(package)
  children=lookup(package)
  if children is None:raise ValueError('Dependency registry unavailable for '+package)
  pending.extend(children)
 return seen

def verify_pie_observation(expected,actual,*,same_actor,paused,require_pause):
 if expected!=actual or not same_actor:raise ValueError('PIE saved actor identity changed')
 if require_pause and not paused:raise ValueError('PIE world resumed during expiry observation')
 return True

def native_expiry_observed(wall,native_wall,expiry):
 """Slate observation may precede the next actor tick after a rendering stall."""
 return wall>=expiry and native_wall>=expiry

def validate_stage(candidate,audit,runtime,paths):
 def require(condition,message):
  if not condition:raise ValueError(message)
 require(candidate.get('scope')=='isolated_saved_stage_v1' and candidate.get('installed') is False,'Staging scope required')
 hashes={key:digest(path) for key,path in paths.items()}
 require(bool(hashes) and all(hashes.values()),'Missing artifact')
 require(candidate.get('artifacts')==hashes,'Candidate artifacts changed')
 pids=[candidate.get('build_pid'),audit.get('pid'),runtime.get('pid')]
 require(all(type(pid) is int and pid>0 for pid in pids) and len(set(pids))==3,'Separate processes required')
 for proof in (audit,runtime):
  require(proof.get('run_id')==candidate.get('run_id') and bool(candidate.get('run_id')),'Evidence run mismatch')
  require(proof.get('artifacts')==hashes,'Evidence artifact mismatch')
  require(proof.get('passed') is True and not proof.get('cleanup_errors'),'Evidence failed or cleanup incomplete')
 for key in ('exact_binding','presentation_verified','preserved_actors'):
  require(audit.get(key) is True,'Audit missing '+key)
 require(type(audit.get('behavior_tests')) is int and audit['behavior_tests']>=20,'Saved graph acceptance missing')
 for key in ('uses_saved_actor','pie_saved_actor_identity_verified','pause_observed_at_activity_expiry','pause_observed_at_identity_expiry','world_paused','native_tick_enabled','tick_when_paused','writer_stopped_after_native_ack','activity_expired_while_paused_with_stopped_writer','expiry_seen_without_writer','map_unchanged_before_exit','protected_files_unchanged'):
  require(runtime.get(key) is True,'Runtime missing '+key)
 return True
