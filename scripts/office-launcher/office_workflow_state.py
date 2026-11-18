"""Dormant Office workflow-state projection candidate; no I/O or authentication.

Only feed this receiver a server response already authenticated and authorized
for the exact binding and NEW workflow_state_v1 scope. Current private-presence
v2 grants do not grant this scope. Schema validation is not proof of provenance.
"""
from dataclasses import dataclass
import hashlib
import json
import math
import re


SCHEMA = "omnira.office.workflow-state.v1"
SCOPE = "workflow_state_v1"
MAX_SECONDS = 20.0
UUID = re.compile(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\Z")
KEYS = frozenset(("schema", "scope", "visit_id", "avatar_id", "project_id",
                  "agent_id", "revision", "observed_at_unix", "expires_at_unix",
                  "workflow_state", "coverage", "execution"))


def number(value):
    return type(value) in (int, float) and 0 <= value < 1e12 and math.isfinite(value)


@dataclass(frozen=True)
class Binding:
    visit_id: str
    avatar_id: str
    project_id: str
    agent_id: str

    def __post_init__(self):
        for field in (self.visit_id, self.project_id, self.agent_id):
            if not isinstance(field, str) or not UUID.fullmatch(field):
                raise ValueError("Canonical binding UUID required")
        if (not isinstance(self.avatar_id, str)
                or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", self.avatar_id)):
            raise ValueError("Bound avatar identifier required")


@dataclass(frozen=True)
class Projection:
    state: str
    workflow_state_known: bool
    workflow_busy: bool
    reason: str

    def native_inputs(self):
        return {"WorkflowStateKnown": self.workflow_state_known,
                "WorkflowBusy": self.workflow_busy}


class WorkflowStateReceiver:
    """Project a bounded, scoped server decision onto the existing native gate.

    Disabled by default. When explicitly enabled, unknown/stale status means
    hold at the office, not verified execution. Only fresh complete idle permits
    leisure. This object never controls a workflow, creates a grant or maps IDs.
    """

    def __init__(self, binding: Binding, *, enabled=False):
        if not isinstance(binding, Binding) or type(enabled) is not bool:
            raise ValueError("Explicit binding and boolean switch required")
        self._binding = binding
        self._enabled = enabled
        self._revision = 0
        self._fingerprint = None
        self._deadline = -1.0
        self._expires = -1.0
        self._last_wall = -1.0
        self._last_mono = -1.0
        self._state = "unknown"
        self._reason = "no_verified_workflow_status"

    @property
    def binding(self):
        return self._binding

    @property
    def enabled(self):
        return self._enabled

    def _invalidate(self, reason):
        self._state = "unknown"
        self._deadline = self._expires = -1.0
        self._reason = reason

    def _clock(self, wall, mono):
        if not number(wall) or not number(mono):
            self._invalidate("invalid_clock")
            return False
        if wall < self._last_wall or mono < self._last_mono:
            self._invalidate("clock_moved_backwards")
            return False
        self._last_wall, self._last_mono = wall, mono
        return True

    def _validate(self, data, wall):
        if type(data) is not dict or data.keys() != KEYS:
            raise ValueError("invalid_contract")
        if data["schema"] != SCHEMA or data["scope"] != SCOPE:
            raise ValueError("unsupported_scope_or_schema")
        for name in ("visit_id", "avatar_id", "project_id", "agent_id"):
            if data[name] != getattr(self.binding, name):
                raise ValueError("binding_mismatch")
        revision = data["revision"]
        if type(revision) is not int or not 1 <= revision < 2**53:
            raise ValueError("invalid_revision")
        observed, expires = data["observed_at_unix"], data["expires_at_unix"]
        if not number(observed) or not number(expires):
            raise ValueError("invalid_deadline")
        if not observed <= wall < expires <= observed + MAX_SECONDS:
            raise ValueError("stale_or_future_status")
        if data["workflow_state"] not in ("busy", "idle", "unknown"):
            raise ValueError("unsupported_workflow_state")
        if data["coverage"] not in ("complete", "incomplete"):
            raise ValueError("invalid_coverage")
        if data["execution"] != "not_verified":
            raise ValueError("execution_claim_not_supported")
        # A partial list cannot establish a negative claim about all workflows.
        if data["workflow_state"] == "idle" and data["coverage"] != "complete":
            raise ValueError("idle_requires_complete_coverage")

    def accept_authorized(self, data, *, wall, mono):
        """Caller must establish authenticated provenance and exact NEW scope.

        Calling this method does not itself establish authentication. The foreground visit companion uses a fixed authenticated HTTPS exchange;
        tests may substitute synthetic authorized fixtures.
        """
        if not self.enabled:
            return Projection("disabled", False, False, "not_connected")
        if not self._clock(wall, mono):
            return self._projection(wall, mono)
        try:
            self._validate(data, wall)
            fingerprint = hashlib.sha256(json.dumps(
                data, sort_keys=True, separators=(",", ":"), allow_nan=False
            ).encode("utf-8")).hexdigest()
            revision = data["revision"]
            if revision < self._revision:
                raise ValueError("replayed_revision")
            if revision == self._revision:
                if fingerprint != self._fingerprint:
                    raise ValueError("revision_changed")
                # Re-reading identical data never renews either local deadline.
                return self._projection(wall, mono)
            self._revision, self._fingerprint = revision, fingerprint
            self._expires = float(data["expires_at_unix"])
            self._deadline = mono + self._expires - wall
            self._state = data["workflow_state"]
            self._reason = "authorized_server_decision"
        except (ValueError, TypeError, OverflowError) as error:
            # Fixed validation reasons only; never echo payloads, names or IDs.
            reason = str(error)
            allowed = {"invalid_contract", "unsupported_scope_or_schema",
                       "binding_mismatch", "invalid_revision", "invalid_deadline",
                       "stale_or_future_status", "unsupported_workflow_state",
                       "invalid_coverage", "execution_claim_not_supported",
                       "idle_requires_complete_coverage", "replayed_revision",
                       "revision_changed"}
            self._invalidate(reason if reason in allowed else "invalid_contract")
        return self._projection(wall, mono)

    def _projection(self, wall, mono):
        if self._state != "unknown" and (wall >= self._expires or mono >= self._deadline):
            self._invalidate("status_expired")
        known = self._state in ("busy", "idle")
        # workflow_busy=True on UNKNOWN is a conservative action, not a UI claim
        # that an agent is executing. The displayed semantic state stays unknown.
        return Projection(self._state, known, self._state != "idle", self._reason)

    def view(self, *, wall, mono):
        if not self.enabled:
            return Projection("disabled", False, False, "not_connected")
        self._clock(wall, mono)
        return self._projection(wall, mono)
