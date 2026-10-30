"""Explicit ONE-batch Strato -> existing Omnira Sales inbox sync (never SMTP/send).

Reuses the already-authorised, project-bound, pinned worker installation, its
read-only IMAP BODY.PEEK reader, its journal and its project-scoped Preview API.
It never starts host_loop, reply generation, send_background, or sales jobs.
The one external state change is the existing *inbox* batch transaction:
headers + any previously owner-selected text only, using unchanged SQL gates.
"""
import argparse
import importlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys

UUID = re.compile(r"^[a-fA-F0-9]{8}-(?:[a-fA-F0-9]{4}-){3}[a-fA-F0-9]{12}$")
ALLOWED_INBOX_OPERATIONS = frozenset({
    "claim_sync", "read_batch_receipt", "commit_batch", "report_sync_failure",
})

class SyncBlocked(Exception):
    pass

class InboxOnlyTransport:
    """Absolute protocol fence: not even accidentally expose send/reply/worker ops."""
    def __init__(self, client):
        self._client = client
        self.last_cursor = None
    def post(self, operation, **values):
        if operation not in ALLOWED_INBOX_OPERATIONS:
            raise SyncBlocked("NON_INBOX_OPERATION_REFUSED")
        response = self._client.post(operation, **values)
        receipt = response.get("receipt") if operation == "read_batch_receipt" and isinstance(response, dict) else response
        if operation in ("commit_batch", "read_batch_receipt") and isinstance(receipt, dict) and receipt.get("accepted") is True:
            cursor = receipt.get("cursor")
            if isinstance(cursor, dict):
                uid = cursor.get("scannedThroughUid")
                validity = cursor.get("uidValidity")
                try:
                    uid = int(uid)
                    validity = int(validity)
                    if 0 <= uid <= 4294967295 and 1 <= validity <= 4294967295:
                        self.last_cursor = {"scannedThroughUid": uid, "uidValidity": validity}
                except (ValueError, TypeError):
                    pass
        return response

def _probe_module():
    path = Path(__file__).with_name("strato-readonly-probe.py")
    spec = importlib.util.spec_from_file_location("omnira_readonly_strato", path)
    if spec is None or spec.loader is None:
        raise SyncBlocked("READONLY_PROBE_UNAVAILABLE")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def sync_one(project_id):
    if not UUID.fullmatch(project_id):
        return {"status": "blocked", "reason": "INVALID_PROJECT", "emailsSent": 0}
    try:
        diagnostic = _probe_module()
        local = os.environ.get("LOCALAPPDATA")
        if not local:
            raise SyncBlocked("LOCAL_INSTALLATION_UNAVAILABLE")
        base = Path(local) / "OmniraSales" / "connections"
        # Reuse the already tested strict local manifest and mailbox reference check.
        _, _, store = diagnostic._local_installation(project_id)
        config = diagnostic._read_local_json(base / (project_id + ".json"))
        if config.get("projectId") != project_id or config.get("mailboxEnabled") is not True:
            raise SyncBlocked("INBOX_NOT_CONFIGURED")
        if config.get("transport") != "vercel_preview":
            raise SyncBlocked("UNEXPECTED_TRANSPORT")
        if not isinstance(config.get("origin"), str) or not config["origin"].startswith("https://"):
            raise SyncBlocked("UNEXPECTED_ORIGIN")
        # This exact transport was previously approved for the pinned Preview.
        root = Path(config["installationRoot"])
        state_dir = base / project_id
        state = diagnostic._read_local_json(state_dir / "connection.json")
        if (state.get("projectId") != project_id or
                state.get("origin") != config.get("origin") or
                state.get("pending") is not None or
                state.get("adopted") is not True):
            raise SyncBlocked("MANAGED_CONNECTION_NOT_READY")
        manager_ref = state.get("managerRef")
        if not isinstance(manager_ref, str) or not manager_ref.startswith("OmniraSales/"):
            raise SyncBlocked("MANAGER_REFERENCE_INVALID")
        try:
            manager_token = store.read(manager_ref)
        except Exception:
            raise SyncBlocked("MANAGER_CREDENTIAL_UNAVAILABLE") from None
        try:
            if not re.fullmatch(r"[A-Za-z0-9_-]{43}", manager_token):
                raise SyncBlocked("MANAGER_CREDENTIAL_UNAVAILABLE")
            transport = importlib.import_module("workers.sales.preview_transport")
            inbox_sync = importlib.import_module("workers.sales.mailbox.inbox_sync")
            journal = importlib.import_module("workers.sales.journal")
            client = InboxOnlyTransport(transport.ProtectedPreviewClient(config, manager_token, "inbox"))
            result = inbox_sync.sync_inbox_once(
                client,
                store,
                journal.Journal(state_dir / "mailbox.json"),
                journal.Journal(state_dir / "inbox.json"),
            )
        finally:
            manager_token = None
        allowed_codes = frozenset({
            "SYNCED", "RECOVERED", "IDLE", "WAITING_RECEIPT", "FENCED",
            "ALREADY_RUNNING", "MAILBOX_SETUP_PENDING", "MAILBOX_NOT_CURRENT",
            "AUTH_FAILED", "TLS_FAILED", "CONNECTION_FAILED",
            "RECONCILING", "UNAVAILABLE", "NOT_FOUND", "STOPPED",
            "PREVIEW_TRANSPORT_FAILED", "PREVIEW_REQUEST_FAILED",
        })
        code = result.code if result.code in allowed_codes else "UNAVAILABLE"
        return {"status": "ok" if code in {"SYNCED","RECOVERED","IDLE"} else "blocked",
                "syncResult": code,
                "cursor": client.last_cursor if code in {"SYNCED", "RECOVERED"} else None,
                "mode": "one_owner_scoped_inbox_batch",
                "providerSends": 0, "emailsSent": 0}
    except SyncBlocked as error:
        return {"status":"blocked","reason":str(error),"emailsSent":0}
    except Exception:
        return {"status":"blocked","reason":"INBOX_SYNC_UNAVAILABLE","emailsSent":0}

def main(argv=None):
    parser = argparse.ArgumentParser(description="One-shot Atlas inbox sync; no mail SEND operations")
    parser.add_argument("--project", required=True, help="The exact existing project UUID")
    parser.add_argument("--sync-one-batch", action="store_true",
                        help="Explicitly request one authorised IMAP-read/DB-inbox-commit cycle")
    args = parser.parse_args(argv)
    if not args.sync_one_batch:
        print(json.dumps({"status":"not_started", "reason":"EXPLICIT_SYNC_FLAG_REQUIRED",
                          "emailsSent":0},sort_keys=True))
        return 1
    outcome = sync_one(args.project)
    print(json.dumps(outcome,sort_keys=True))
    return 0 if outcome["status"] == "ok" else 1

if __name__ == "__main__":
    sys.exit(main())
