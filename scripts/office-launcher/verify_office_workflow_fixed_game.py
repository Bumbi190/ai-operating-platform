"""Owned real -game process/native-path test. Owner/DB/TLS stay synthetic.

Never registers a URI or reads login secrets. Temporarily snapshots the shared
projection under its writer lock, restores only our visit, and closes only the
game process spawned by this test. Private prior bytes stay in memory.
"""
from pathlib import Path
import hashlib,json,os,subprocess,sys,time,traceback
from office_launcher import WindowsBackend
from office_workflow_target import default_workflow_target,matching_workflow
from office_workflow_bundle import verify_bundle
from office_install_guard import ProjectionFixture,atomic_bytes,digest
from office_workflow_ack import ack_path,read_native_ack

def main():
    repo=Path(__file__).resolve().parents[2];target=default_workflow_target();target.verify();root=target.project.parent
    install=root/'Saved/OfficeWorkflowInstall';candidate=json.loads((install/'candidate.json').read_text());verify_bundle(candidate['bundle'])
    out=install/'fixed-game';out.mkdir(exist_ok=True);shared=root/'Saved/OfficePresence';shared.mkdir(exist_ok=True)
    source=shared/'office-familje-pling.json';ack=ack_path(shared,'office-familje-pling');control=shared/'control.json';transport=shared/'transport.json'
    assert not any(matching_workflow(p,target) for p in WindowsBackend().running()),'Preserve an already-running workflow game'
    assert not control.exists() and not transport.exists(),'Existing test-control files require inspection'
    snapshot={};game=node=None;logs=[];own_visit=None;cleaned=False
    result={'scope':'fixed_workflow_game_path_v1','passed':False,'run_id':candidate['run_id'],'real_owner':False,'real_upstream_tls':False,'real_game_process_lease':True,'native_ack_fixture':False,'errors':[]}
    def record():atomic_bytes(out/'proof.json',(json.dumps(result,indent=2)+'\n').encode('utf-8'))
    def read(path):
        try:return json.loads(path.read_text('utf-8-sig'))
        except (OSError,ValueError,UnicodeError):return {}
    def until(test,timeout):
        end=time.monotonic()+timeout
        while time.monotonic()<end:
            if test():return
            if node and node.poll() is not None:raise RuntimeError('Fixed-game test transport exited early')
            time.sleep(.1)
        raise TimeoutError('Fixed-game acceptance timed out')
    def write_control(**values):
        cmd=read(control);cmd.update(values);atomic_bytes(control,json.dumps(cmd).encode())
    def confirmed(state):
        frame=read(source)
        return frame.get('workflow_state')==state and read_native_ack(ack,frame,'applied') is not None
    try:
        fixture=ProjectionFixture(source);fixture.acquire()
        try:
            for path in (source,ack):snapshot[path]=path.read_bytes() if path.exists() else None;path.unlink(missing_ok=True)
        finally:fixture.restore()
        result['phase']='booting_game';record()
        game=subprocess.Popen(target.argv(),cwd=root);result['game_pid']=game.pid;record()
        # Game startup precedes the15s pairing lease; never bind a bootstrap visit.
        started=time.monotonic()
        while time.monotonic()-started<30:
            assert game.poll() is None,'Owned game exited during boot';time.sleep(.2)
        env=os.environ.copy();env['NODE_PATH']=r'C:\Users\Andre\Projects\Omnira\.worktrees\atlas-office-entry-20261106\node_modules';env['OFFICE_TEST_PYTHON']=sys.executable
        write_control(gameAlive=True,state='idle',finish=False)
        logs=[(out/'transport.stdout.txt').open('w'),(out/'transport.stderr.txt').open('w')]
        node=subprocess.Popen(['node',str(repo/'scripts/office-launcher/workflow_fixed_game_transport_fixture.mjs'),str(shared)],cwd=repo,env=env,stdout=logs[0],stderr=logs[1],creationflags=subprocess.CREATE_NO_WINDOW)
        result['phase']='native_pairing';record();until(lambda:read(transport).get('connected') and confirmed('idle'),30)
        own_visit=read(transport)['visitId'];result['prepared_and_applied_native_ack']=True;result['fixed_projection_directory']=str(shared);result['phase']='busy';record()
        write_control(state='busy');until(lambda:confirmed('busy'),15);result['busy_applied']=True
        write_control(state='idle');until(lambda:confirmed('idle'),15);result['idle_applied_again']=True
        # Exact held Windows process exit, rather than a mocked boolean lease.
        game.terminate();game.wait(timeout=15);result['phase']='kernel_exit';record()
        until(lambda:read(source).get('visit_state')=='closed' and read(transport).get('revoked') is True,15)
        result['kernel_handle_exit_closes_visit']=True;write_control(finish=True,gameAlive=False)
        node.wait(timeout=15);assert node.returncode==0
        final=read(source);assert final.get('visit_id')==own_visit and final.get('visit_state')=='closed'
        result['transport']=read(transport);result['phase']='restoring';record()
    except Exception:
        result['errors'].append(traceback.format_exc())
    finally:
        if game and game.poll() is None:game.terminate();game.wait(timeout=15)
        if node and node.poll() is None:
            write_control(finish=True,gameAlive=False)
            try:node.wait(timeout=8)
            except subprocess.TimeoutExpired:node.terminate();node.wait(timeout=8)
        for log in logs:log.close()
        if own_visit is None and node:own_visit=read(transport).get('visitId')
        if snapshot:
            try:
                fixture=ProjectionFixture(source);fixture.acquire()
                try:
                    current=read(source);current_ack=read(ack)
                    if source.exists():assert own_visit and current.get('visit_id')==own_visit,'Foreign projection; preserving it'
                    if ack.exists():assert own_visit and current_ack.get('visit_id')==own_visit,'Foreign acknowledgement; preserving it'
                    for path,data in snapshot.items():
                        if data is None:path.unlink(missing_ok=True)
                        else:atomic_bytes(path,data)
                    for path in (control,transport):path.unlink(missing_ok=True)
                    assert all((path.read_bytes() if path.exists() else None)==data for path,data in snapshot.items());cleaned=True
                finally:fixture.restore()
            except Exception:result['errors'].append('Cleanup: '+traceback.format_exc())
        result['projection_restored']=cleaned;result['passed']=not result['errors'] and cleaned and result.get('kernel_handle_exit_closes_visit') is True;result['phase']='complete' if result['passed'] else 'failed';record()
    print(json.dumps({k:v for k,v in result.items() if k not in ('transport',)},indent=2));return 0 if result['passed'] else 1

if __name__=='__main__':raise SystemExit(main())
