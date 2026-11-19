"""Bounded local acknowledgement from the saved native Blueprint consumer.
Local filesystem integrity/trusted companion boundary; not remote attestation.
"""
import json
import math
from pathlib import Path
import time
from office_relay import _no_duplicate_keys

SCHEMA='omnira.office.workflow-native-ack.v1'
KEYS=frozenset(('schema','scope','phase','visit_id','avatar_id','project_id','agent_id',
                'revision','observed_at_unix','expires_at_unix','workflow_state',
                'workflow_state_known','workflow_busy','execution'))

def ack_path(output, avatar):return Path(output)/(avatar+'.json.native-ack.json')

def read_native_ack(path, expected, phase):
    """Return a monotonic deadline only for the exact current prepared/applied frame.
    A torn native write, old visit, wrong scope or expired ack is not confirmation.
    """
    try:
        path=Path(path)
        if not path.is_file() or path.is_symlink() or (hasattr(path,'is_junction') and path.is_junction()):return None
        with path.open('rb') as handle:raw=handle.read(4097)
        if len(raw)>4096:return None
        data=json.loads(raw.decode('utf-8-sig'),object_pairs_hook=_no_duplicate_keys,
                        parse_constant=lambda _:(_ for _ in ()).throw(ValueError()))
        if type(data) is not dict or data.keys()!=KEYS:return None
        if data['schema']!=SCHEMA or data['scope']!='workflow_state_v1' or data['phase']!=phase:return None
        required='preparing' if phase=='prepared' else 'active'
        if expected.get('visit_state')!=required or phase not in ('prepared','applied'):return None
        for key in ('visit_id','avatar_id','project_id','agent_id','workflow_state','workflow_state_known','workflow_busy','execution'):
            if type(data[key]) is not type(expected[key]) or data[key]!=expected[key]:return None
        for key in ('revision','observed_at_unix','expires_at_unix'):
            if type(data[key]) not in (int,float) or not math.isfinite(data[key]) or data[key]!=expected[key]:return None
        if not 0<=data['revision']<2**53 or int(data['revision'])!=data['revision']:return None
        if phase=='prepared' and data['revision']!=0:return None
        if phase=='applied' and data['revision']<1:return None
        for key in ('observed_at_unix','expires_at_unix'):
            if type(data[key]) not in (int,float) or not math.isfinite(data[key]):return None
        wall,mono=time.time(),time.monotonic()
        if not 0<=data['observed_at_unix']<=wall<data['expires_at_unix']<=data['observed_at_unix']+20:return None
        if data['execution']!='not_verified' or type(data['workflow_busy']) is not bool or type(data['workflow_state_known']) is not bool:return None
        return mono+max(0,data['expires_at_unix']-wall)
    except (OSError,ValueError,UnicodeError,KeyError,TypeError,OverflowError,RecursionError):return None
