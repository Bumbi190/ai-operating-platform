"""Private workflow frame after the fixed authenticated visit HTTPS exchange.
This is a read-only reservation indicator, never model/tool execution evidence.
"""
import copy
import time
from office_presence import PresenceReceiver
from office_workflow_state import Binding, WorkflowStateReceiver

SCHEMA = 'omnira.office.workflow-presence.v1'

class WorkflowVisitPresenceReceiver(PresenceReceiver):
    def __init__(self, binding, visit_id):
        super().__init__(binding)
        self._policy = WorkflowStateReceiver(Binding(visit_id, binding.avatar_id,
                                                    binding.project_id, binding.agent_id), enabled=True)
        self._data = None
        self._native_deadline = -1.0

    def accept_authorized(self, data):
        """Only caller: fixed HTTPS client inside an authorized, bound visit.
        Validation alone is not authentication; fixture clients are synthetic.
        """
        wall, mono = time.time(), time.monotonic()
        projection = self._policy.accept_authorized(data, wall=wall, mono=mono)
        if projection.reason != 'authorized_server_decision':
            raise ValueError('Workflow status unavailable')
        candidate = mono + max(0, data['expires_at_unix'] - wall)
        if self._data is not None and data['revision'] == self._data['revision']:
            candidate = min(candidate, self._native_deadline)
        self._native_deadline = candidate
        self._data = copy.deepcopy(data)
        return self.view()

    def view(self, *, now=None):
        wall = time.time() if now is None else now
        mono = time.monotonic()
        projection = self._policy.view(wall=wall, mono=mono)
        fresh = (self._data is not None and projection.reason == 'authorized_server_decision'
                 and wall < self._data['expires_at_unix'] and mono < self._native_deadline)
        # An invalid/unavailable/expired frame actively holds the native work gate.
        state = projection.state if fresh else 'unknown'
        return {
            'schema': SCHEMA, 'scope': 'workflow_state_v1',
            'visit_id': self._policy.binding.visit_id, 'avatar_id': self.binding.avatar_id,
            'project_id': self.binding.project_id, 'agent_id': self.binding.agent_id,
            'revision': self._data['revision'] if fresh else 0,
            'observed_at_unix': self._data['observed_at_unix'] if fresh else 0,
            'expires_at_unix': self._data['expires_at_unix'] if fresh else 0,
            'workflow_state': state,
            'coverage': self._data['coverage'] if fresh else 'incomplete',
            'workflow_state_known': state in ('busy','idle'), 'workflow_busy': state != 'idle',
            'identity': 'verified' if fresh else 'unknown', 'data_state': 'fresh' if fresh else 'unavailable',
            'execution': 'not_verified', 'work_verified': False,
        }
