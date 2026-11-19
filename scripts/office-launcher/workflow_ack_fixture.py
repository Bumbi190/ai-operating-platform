"""Synthetic native acknowledger for headless tests ONLY. Never runtime-imported.
Actual Unreal acceptance uses the saved Blueprint writing its own acknowledgments.
"""
import json
from pathlib import Path
import threading
import time
from office_workflow_ack import SCHEMA,KEYS,ack_path

class FixtureNativeAck:
    def __init__(self,output,avatar='office-familje-pling'):
        self.output=Path(output);self.avatar=avatar;self.halt=threading.Event();self.thread=None
    def start(self):
        def run():
            while not self.halt.wait(.01):
                try:
                    frame=json.loads((self.output/(self.avatar+'.json')).read_text('utf-8'))
                    if frame.get('schema')!='omnira.office.workflow-presence.v1':continue
                    phase={'preparing':'prepared','active':'applied','closed':'closed'}[frame['visit_state']]
                    data={k:frame[k] for k in KEYS-{'schema','scope','phase'}}
                    data.update(schema=SCHEMA,scope='workflow_state_v1',phase=phase)
                    path=ack_path(self.output,self.avatar);tmp=path.with_suffix('.fixture.tmp')
                    tmp.write_text(json.dumps(data),'utf-8');tmp.replace(path)
                except (OSError,ValueError,KeyError):pass
        self.thread=threading.Thread(target=run,daemon=True);self.thread.start();return self
    def stop(self):
        self.halt.set()
        if self.thread:self.thread.join(1)
