"""Private, read-only adapter from existing Campus DTOs to one Unreal avatar.

This module is NOT authentication, a network bridge, or an execution grant.
Only an authenticated, project-scoped transport may supply the two input DTOs.
It cannot start a workflow or interpret commands. Until that transport and an
Unreal consumer are connected, use synthetic fixtures only and do not call it live.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import json
import math
import os
from pathlib import Path
import re
import tempfile
import time
import unicodedata

UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I)
AVATAR = re.compile(r'^[a-z0-9][a-z0-9_-]{2,63}$')
SNAPSHOT_TTL = 20.0
CLOCK_SKEW = 2.0


@dataclass(frozen=True)
class AvatarBinding:
    avatar_id: str
    project_id: str
    agent_id: str

    def __post_init__(self):
        if not AVATAR.fullmatch(self.avatar_id) or not UUID.fullmatch(self.project_id) or not UUID.fullmatch(self.agent_id):
            raise ValueError('An explicit avatar/project/agent binding is required')


def _clock(value) -> float:
    if not isinstance(value, str) or len(value) > 40:
        raise ValueError('Invalid source timestamp')
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('Source timestamp needs a timezone')
    stamp = parsed.timestamp()
    if not math.isfinite(stamp):
        raise ValueError('Invalid source timestamp')
    return stamp


def _now(value) -> float:
    value = time.time() if value is None else value
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError('Invalid local timestamp')
    return float(value)


def _text(value) -> str:
    if not isinstance(value, str):
        raise ValueError('Missing registered name')
    value = ''.join(' ' if unicodedata.category(c).startswith('C') else c for c in value)
    value = ' '.join(value.split())[:80]
    if not value:
        raise ValueError('Empty registered name')
    return value


class PresenceReceiver:
    def __init__(self, binding: AvatarBinding):
        self.binding = binding
        self._frame = None
        self._received_at = None
        self._newest_source = -math.inf
        self._step_expires = -math.inf
        self._expired = False
        self._deadline = -math.inf
        self._step_deadline = -math.inf

    def _unknown(self, state='unavailable') -> dict:
        return {
            'schema': 'omnira.office.private-presence.v1',
            'avatar_id': self.binding.avatar_id, 'data_state': state,
            'identity': 'unknown', 'execution': 'not_verified', 'work_verified': False,
            'animation': 'ambient', 'project_text': '', 'agent_text': '',
            'status_text': ('Anslutning inaktuell · arbetsstatus okänd' if state == 'stale'
                            else 'Ingen verifierad anslutning'),
            'step_reference': None, 'step_expires_at_unix': None, 'expires_at_unix': None,
        }

    def accept(self, binding, snapshot, *, now=None) -> dict:
        now = _now(now)
        try:
            if (not isinstance(binding, dict) or not isinstance(snapshot, dict)
                    or len(json.dumps(binding, allow_nan=False)) > 16000
                    or len(json.dumps(snapshot, allow_nan=False)) > 256000):
                raise ValueError('Invalid payload')
            if (type(binding.get('schemaVersion')) is not int or binding['schemaVersion'] != 1
                    or binding.get('source') != 'AUTHENTICATED_PROJECT_AGENT_MATCH_V036'
                    or binding.get('verifiedIdentity') is not True
                    or binding.get('character') != 'pling' or binding.get('public3dBinding') != 'none'
                    or type(snapshot.get('schemaVersion')) is not int or snapshot['schemaVersion'] != 2
                    or snapshot.get('dataSource') != 'authorized_organisation_read'):
                raise ValueError('Unknown source/version')
            available = snapshot['availability']
            if available.get('projects') is not True or available.get('agents') is not True:
                raise ValueError('Identity reads unavailable')
            b_project, b_agent = binding['project'], binding['agent']
            selected = self.binding
            if b_project['id'] != selected.project_id or b_agent['id'] != selected.agent_id:
                raise ValueError('Wrong selected identity')
            projects = snapshot['projects']
            if not isinstance(projects, list) or len(projects) > 25:
                raise ValueError('Unsupported project list')
            matching = [p for p in projects if p['id'] == selected.project_id]
            if len(matching) != 1 or matching[0]['slug'] != b_project['slug']:
                raise ValueError('Unmatched or ambiguous project')
            agents = matching[0]['agents']
            if not isinstance(agents, list) or len(agents) > 30:
                raise ValueError('Unsupported agent list')
            matching_agents = [a for a in agents if a['id'] == selected.agent_id]
            if len(matching_agents) != 1:
                raise ValueError('Unmatched or ambiguous agent')
            generated, verified = _clock(snapshot['generatedAt']), _clock(binding['verifiedAt'])
            if generated <= self._newest_source:
                return self.view(now=now)  # Reordering/replay never erases or refreshes newer data.
            if any(stamp > now + CLOCK_SKEW or now - stamp >= SNAPSHOT_TTL for stamp in (generated, verified)):
                raise ValueError('Stale or future identity read')
            frame = self._unknown()
            frame.update(data_state='fresh', identity='verified',
                         project_text=_text(b_project['name']), agent_text=_text(b_agent['name']),
                         status_text='Identitet verifierad · arbetsstatus okänd',
                         expires_at_unix=min(generated, verified) + SNAPSHOT_TTL)
            step = matching_agents[0].get('stepRequest')
            step_expires = -math.inf
            if available.get('stepEvidence') is True and isinstance(step, dict):
                try:
                    observed = _clock(step.get('observedAt'))
                except (ValueError, TypeError, OverflowError):
                    observed = -math.inf
                if (step.get('kind') == 'step_request_waiting_for_reply'
                        and isinstance(step.get('runId'), str) and UUID.fullmatch(step['runId'])
                        and type(step.get('stepOrder')) is int and 0 <= step['stepOrder'] <= 99
                        and observed <= generated + CLOCK_SKEW
                        and matching_agents[0].get('executionEvidence') == 'unavailable'
                        and 0 <= now - observed <= 90):
                    frame.update(status_text='Stegbegäran registrerad · körning ej verifierad',
                                 step_reference={'run_id': step['runId'], 'step_order': step['stepOrder']})
                    step_expires = observed + 90
                    frame['step_expires_at_unix'] = step_expires
            self._frame, self._received_at, self._newest_source = frame, now, generated
            self._step_expires = step_expires
            self._expired = False
            monotonic = time.monotonic()
            self._deadline = monotonic + max(0, frame['expires_at_unix'] - now)
            self._step_deadline = monotonic + max(0, step_expires - now)
        except (ValueError, TypeError, KeyError, AttributeError, OverflowError):
            self._frame, self._received_at = None, None
        return self.view(now=now)

    def view(self, *, now=None) -> dict:
        now = _now(now)
        if self._frame is None:
            return self._unknown()
        if (self._expired or now < self._received_at - CLOCK_SKEW
                or now >= self._frame['expires_at_unix'] or time.monotonic() >= self._deadline):
            self._expired = True
            return self._unknown('stale')
        # Return an independent safe projection, never any raw prompts, keys or commands.
        result = json.loads(json.dumps(self._frame))
        if result['step_reference'] is not None and (now >= self._step_expires or time.monotonic() >= self._step_deadline):
            result.update(step_reference=None, step_expires_at_unix=None,
                          status_text='Identitet verifierad · arbetsstatus okänd')
        return result


def write_presence(path: Path, receiver: PresenceReceiver, *, now=None) -> None:
    """Write only a fresh receiver projection, never a caller-supplied dictionary."""
    if not isinstance(receiver, PresenceReceiver):
        raise TypeError('A trusted presence receiver is required, not a raw payload')
    path = Path(path)
    # A Windows native reader can briefly hold the destination without delete
    # sharing. Windows MoveFileEx can report access denied for this too.
    # Retry briefly, then preserve the original error; keep replacement atomic.
    for attempt in range(8):
        frame = receiver.view(now=now)
        descriptor, staging = tempfile.mkstemp(dir=path.parent, prefix=path.name + '.', suffix='.tmp')
        try:
            # Re-read the accepted receiver on every attempt: a lock must never
            # carry a cached positive identity across its source deadline.
            with os.fdopen(descriptor, 'w', encoding='utf-8') as handle:
                json.dump(frame, handle, ensure_ascii=False, allow_nan=False)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(staging, path)
            return
        except OSError as error:
            if getattr(error, 'winerror', None) not in (5, 32, 33) or attempt == 7:
                raise
        finally:
            if os.path.exists(staging):
                os.unlink(staging)
        time.sleep(0.025)
