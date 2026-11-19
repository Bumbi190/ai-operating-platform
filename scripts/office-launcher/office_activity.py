"""Optional step-activity projection. No task execution, voice or model calls."""
import math
import time
from pathlib import Path
import hashlib
import json
from office_presence import PresenceReceiver, _clock, _now

SCHEMA = 'omnira.office.private-presence.v2'
KIND = 'step_request_waiting_for_reply'

def check_activity_native(target):
    """Only a canonical saved receiver with independent acceptance may enable v2."""
    if (target.project.parent/'Saved/OfficeActivityInstall/installation.json').exists():
        from office_activity_install import check_canonical
        return check_canonical(target,Path(__file__).resolve().parent)
    if (target.project.parent/'Saved/OfficeActivitySetup/installation.json').exists():
        raise ValueError('Saved activity receiver finalization is not yet supported')
    return None

class ActivityPresenceReceiver(PresenceReceiver):
    def __init__(self, binding):
        self._activity_key = None
        self._activity_newest = -math.inf
        self._activity_closed = True
        self._activity_deadline = -math.inf
        self._activity_until = -math.inf
        super().__init__(binding)

    def _unknown(self, state='unavailable'):
        return {**super()._unknown(state), 'schema': SCHEMA,
                'activity_kind': 'none', 'activity_expires_at_unix': 0,
                'activity_event_key': '', 'activity_observed_at_unix': 0}

    def accept(self, binding, snapshot, *, now=None):
        now = _now(now)
        previous = self._newest_source
        super().accept(binding, snapshot, now=now)
        if self._frame is None:
            self._activity_closed = True
            return self.view(now=now)
        if self._newest_source <= previous:
            return self.view(now=now)
        try:
            agent = snapshot['projects'][0]['agents'][0]
            step = agent['stepRequest']
            if self._frame['step_reference'] is None or not isinstance(step, dict):
                raise ValueError('No activity')
            observed, lease = _clock(step['observedAt']), _clock(step['leaseUntil'])
            if lease <= now or observed > now or lease <= observed:
                raise ValueError('Activity lease unavailable')
            key = (step['runId'], step['stepOrder'], observed)
            until = min(observed + 90, lease, self._frame['expires_at_unix'])
            deadline = time.monotonic() + max(0, until - now)
            if key != self._activity_key:
                if observed <= self._activity_newest:
                    raise ValueError('Old activity cannot reappear')
                self._activity_key, self._activity_newest = key, observed
                self._activity_closed = False
                self._activity_deadline = deadline
                self._activity_until = until
            else:
                self._activity_deadline = min(self._activity_deadline, deadline)
                self._activity_until = min(self._activity_until, until)
            self._step_expires = self._activity_until
            self._step_deadline = self._activity_deadline
            self._frame['step_expires_at_unix'] = self._activity_until
        except (ValueError, TypeError, KeyError, IndexError, OverflowError):
            self._activity_closed = True
        return self.view(now=now)

    def view(self, *, now=None):
        now = _now(now)
        frame = super().view(now=now)
        positive = (frame['identity'] == 'verified' and frame.get('step_reference') is not None
                    and not self._activity_closed and now < self._step_expires
                    and time.monotonic() < self._activity_deadline)
        if not positive:
            # Once observed expired/answered/unavailable, that same event stays spent.
            self._activity_closed = True
            frame.update(step_reference=None, step_expires_at_unix=None,
                         activity_kind='none', activity_expires_at_unix=0,
                         activity_event_key='', activity_observed_at_unix=0)
            if frame['identity'] == 'verified':
                frame['status_text'] = 'Identitet verifierad · arbetsstatus okänd'
        else:
            until=min(self._activity_until, frame['expires_at_unix'],
                      now+max(0,self._activity_deadline-time.monotonic()))
            self._activity_until=until
            self._step_expires=min(self._step_expires,until)
            frame.update(activity_kind=KIND,
                         activity_expires_at_unix=until, step_expires_at_unix=until,
                         activity_event_key=hashlib.sha256(repr(self._activity_key).encode('ascii')).hexdigest(),
                         activity_observed_at_unix=self._activity_newest,
                         status_text='Stegbegäran registrerad · körning ej verifierad')
        frame['schema'] = SCHEMA
        return frame
