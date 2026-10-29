"""Read-only, one-shot Strato IMAP verification for a locally pinned Omnira Sales installation.

No SMTP, no message FETCH, no body/subject/address output, no database or worker requests.
The Windows Credential Manager secret is used only in memory to authenticate to the
fixed Strato IMAP endpoint, then the connection selects INBOX readonly and logs out.
Run only from the signed-in machine owner's terminal; never in CI or a remote server.
"""
import argparse
import hashlib
import importlib
import imaplib
import json
import os
from pathlib import Path, PurePosixPath
import re
import socket
import ssl
import sys

UUID = re.compile(r"^[a-fA-F0-9]{8}-(?:[a-fA-F0-9]{4}-){3}[a-fA-F0-9]{12}$")
MAX_LOCAL_JSON = 16384
MAX_MAILBOX_COUNT = 2_147_483_647

class ProbeBlocked(Exception):
    pass

class ProbeConnectionFailed(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code

def _read_local_json(path):
    if not path.is_file() or path.stat().st_size > MAX_LOCAL_JSON:
        raise ProbeBlocked("LOCAL_CONFIG_UNAVAILABLE")
    if path.is_symlink() or (hasattr(path, "is_junction") and path.is_junction()):
        raise ProbeBlocked("UNSAFE_LOCAL_PATH")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, UnicodeError, OSError):
        raise ProbeBlocked("LOCAL_CONFIG_UNAVAILABLE") from None
    if not isinstance(value, dict):
        raise ProbeBlocked("LOCAL_CONFIG_UNAVAILABLE")
    return value

def _verify_pinned_installation(root, pinned_sha):
    if not root.is_absolute() or not re.fullmatch(r"[a-f0-9]{64}", str(pinned_sha)):
        raise ProbeBlocked("INSTALLATION_UNVERIFIED")
    for item in (root, *root.parents):
        if item.is_symlink() or (hasattr(item, "is_junction") and item.is_junction()):
            raise ProbeBlocked("UNTRUSTED_INSTALLATION")
    try:
        raw = (root / "installation-manifest.json").read_bytes()
        if len(raw) > 262144 or hashlib.sha256(raw).hexdigest() != pinned_sha:
            raise ProbeBlocked("INSTALLATION_UNVERIFIED")
        files = json.loads(raw)["files"]
        if not isinstance(files, dict) or not 1 <= len(files) <= 1000:
            raise ProbeBlocked("INSTALLATION_UNVERIFIED")
        for name, digest in files.items():
            relative = PurePosixPath(name)
            if (relative.is_absolute() or ".." in relative.parts
                    or "\\" in name or ":" in name or not re.fullmatch(r"[a-f0-9]{64}", str(digest))):
                raise ProbeBlocked("INSTALLATION_UNVERIFIED")
            path = root / name
            if (path.is_symlink() or (hasattr(path, "is_junction") and path.is_junction())
                    or not path.is_file() or path.stat().st_size > 25_000_000):
                raise ProbeBlocked("INSTALLATION_UNVERIFIED")
            if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
                raise ProbeBlocked("INSTALLATION_UNVERIFIED")
        if "workers/sales/credential_store.py" not in files:
            raise ProbeBlocked("INSTALLATION_UNVERIFIED")
    except ProbeBlocked:
        raise
    except Exception:
        raise ProbeBlocked("INSTALLATION_UNVERIFIED") from None

def _local_installation(project_id):
    local = os.environ.get("LOCALAPPDATA")
    if not local or not UUID.fullmatch(project_id):
        raise ProbeBlocked("LOCAL_CONFIG_UNAVAILABLE")
    base = Path(local) / "OmniraSales"
    config = _read_local_json(base / "connections" / (project_id + ".json"))
    if config.get("projectId") != project_id:
        raise ProbeBlocked("PROJECT_MISMATCH")
    location = config.get("installationRoot")
    if not isinstance(location, str):
        raise ProbeBlocked("INSTALLATION_UNAVAILABLE")
    root = Path(location)
    # Exact installation containment; do not load Python from a user-selected path.
    try:
        if not root.is_relative_to(base / "pilots"):
            raise ProbeBlocked("UNTRUSTED_INSTALLATION")
    except (TypeError, ValueError):
        raise ProbeBlocked("UNTRUSTED_INSTALLATION") from None
    _verify_pinned_installation(root, config.get("manifestSha256", ""))
    sys.path.insert(0, str(root))
    try:
        credential_module = importlib.import_module("workers.sales.credential_store")
    except Exception:
        raise ProbeBlocked("INSTALLATION_UNVERIFIED") from None
    state = _read_local_json(base / "connections" / project_id / "mailbox.json")
    if state.get("pending") is not None:
        raise ProbeBlocked("MAILBOX_SETUP_PENDING")
    active = state.get("active")
    if not isinstance(active, dict) or not UUID.fullmatch(str(active.get("mailboxId", ""))):
        raise ProbeBlocked("MAILBOX_NOT_ACTIVE")
    if active.get("generation") not in range(1, 2_147_483_648):
        raise ProbeBlocked("MAILBOX_NOT_ACTIVE")
    email = active.get("email")
    if not isinstance(email, str) or len(email) > 254 or "@" not in email or "\x00" in email:
        raise ProbeBlocked("MAILBOX_NOT_ACTIVE")
    ref = active.get("credentialRef")
    expected_prefix = credential_module.connection_key("https://mailbox.local", project_id) + "/mailbox/"
    if not isinstance(ref, str) or not ref.startswith(expected_prefix):
        raise ProbeBlocked("CREDENTIAL_REFERENCE_INVALID")
    return email, ref, credential_module.CredentialStore()

def check_imap_readonly(email, password, *, factory=None):
    """Uses ONLY AUTHENTICATE and SELECT readonly; no UID SEARCH/FETCH or STORE."""
    if not isinstance(email, str) or not isinstance(password, str):
        raise ProbeConnectionFailed("LOCAL_CREDENTIAL_UNAVAILABLE")
    if "\x00" in email or "\x00" in password or not 1 <= len(password.encode("utf-8")) <= 2048:
        raise ProbeConnectionFailed("LOCAL_CREDENTIAL_UNAVAILABLE")
    tls = ssl.create_default_context()
    tls.minimum_version = ssl.TLSVersion.TLSv1_2
    client = None
    phase = "CONNECT"
    try:
        maker = factory or imaplib.IMAP4_SSL
        client = maker("imap.strato.de", 993, ssl_context=tls, timeout=8)
        client.debug = 0
        caps = {str(v).upper() for v in client.capabilities}
        if "AUTH=PLAIN" not in caps:
            raise ProbeConnectionFailed("IMAP_AUTH_UNSUPPORTED")
        phase = "AUTH"
        encoded = b"\x00" + email.encode("utf-8") + b"\x00" + password.encode("utf-8")
        answer, _ = client.authenticate("PLAIN", lambda _challenge: encoded)
        if answer != "OK":
            raise ProbeConnectionFailed("IMAP_AUTH_FAILED")
        phase = "SELECT"
        answer, data = client.select("INBOX", readonly=True)
        if answer != "OK" or not isinstance(data, list) or len(data) != 1:
            raise ProbeConnectionFailed("INBOX_READ_FAILED")
        try:
            count = int(data[0])
        except (ValueError, TypeError):
            raise ProbeConnectionFailed("INBOX_READ_FAILED") from None
        if not 0 <= count <= MAX_MAILBOX_COUNT:
            raise ProbeConnectionFailed("INBOX_READ_FAILED")
        def counter(name, minimum, maximum):
            try:
                _, values = client.response(name)
                if not isinstance(values, list) or len(values) != 1:
                    return None
                value = int(values[0])
                return value if minimum <= value <= maximum else None
            except Exception:
                return None
        return {"status": "ok", "imapAuthenticated": True, "inboxReadonly": True,
                "messageCount": count,
                "uidNext": counter("UIDNEXT", 1, 4294967296),
                "uidValidity": counter("UIDVALIDITY", 1, 4294967295),
                "messagesFetched": 0, "emailsSent": 0}
    except ssl.SSLError:
        raise ProbeConnectionFailed("TLS_FAILED") from None
    except (TimeoutError, socket.timeout, ConnectionError, OSError):
        raise ProbeConnectionFailed("CONNECTION_FAILED") from None
    except imaplib.IMAP4.error:
        raise ProbeConnectionFailed("IMAP_AUTH_FAILED" if phase == "AUTH" else "INBOX_READ_FAILED") from None
    finally:
        if client is not None:
            try:
                if hasattr(client, "sock") and client.sock is not None:
                    client.sock.settimeout(2)
                client.logout()
            except Exception:
                try:
                    client.shutdown()
                except Exception:
                    pass

def run(project_id):
    try:
        email, ref, store = _local_installation(project_id)
        try:
            password = store.read(ref)
        except Exception:
            raise ProbeBlocked("LOCAL_CREDENTIAL_UNAVAILABLE") from None
        try:
            return check_imap_readonly(email, password)
        finally:
            password = None
    except ProbeBlocked as error:
        return {"status": "blocked", "reason": str(error),
                "messagesFetched": 0, "emailsSent": 0}
    except ProbeConnectionFailed as error:
        return {"status": "unavailable", "reason": error.code,
                "messagesFetched": 0, "emailsSent": 0}
    except Exception:
        return {"status": "unavailable", "reason": "UNKNOWN_FAILURE",
                "messagesFetched": 0, "emailsSent": 0}

def main(argv=None):
    parser = argparse.ArgumentParser(description="One-shot READ-ONLY Strato IMAP probe (no mail content)")
    parser.add_argument("--project", required=True, help="Handlarborsen project UUID")
    args = parser.parse_args(argv)
    result = run(args.project)
    print(json.dumps(result, sort_keys=True))
    return 0 if result["status"] == "ok" else 1

if __name__ == "__main__":
    sys.exit(main())
