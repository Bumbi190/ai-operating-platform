"""Bounded, low-cost Strato inbox-only tick.

A read-only IMAP SELECT/UIDNEXT check runs first. An existing owner-approved inbox
batch is synced ONLY when the server UID advanced or UIDVALIDITY changed.
There is no email sending, model generation, message printing, or host startup.
One run terminates; schedule externally under the interactive user if approved.
"""
import argparse
from datetime import datetime, timezone, timedelta
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import tempfile

UUID = re.compile(r"^[a-fA-F0-9]{8}-(?:[a-fA-F0-9]{4}-){3}[a-fA-F0-9]{12}$")

class WatchBlocked(Exception):
    pass

def _module(filename,modname):
    spec = importlib.util.spec_from_file_location(modname,Path(__file__).with_name(filename))
    if spec is None or spec.loader is None:
        raise WatchBlocked("REVIEWED_MODULE_MISSING")
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result

def _checkpoint_path(project_id, home=None):
    if not UUID.fullmatch(project_id):
        raise WatchBlocked("INVALID_PROJECT")
    root = Path(home or os.environ.get("LOCALAPPDATA","")) / "OmniraSales" / "inbox-only"
    if not home and not os.environ.get("LOCALAPPDATA"):
        raise WatchBlocked("LOCAL_HOME_UNAVAILABLE")
    return root / project_id / "cursor.json"

def _read_checkpoint(project_id, home=None):
    path = _checkpoint_path(project_id, home)
    if not path.exists():
        return None
    if path.is_symlink() or (hasattr(path,"is_junction") and path.is_junction()):
        raise WatchBlocked("UNSAFE_CHECKPOINT")
    if not path.is_file() or path.stat().st_size > 1024:
        raise WatchBlocked("INVALID_CHECKPOINT")
    try:
        entry = json.loads(path.read_text(encoding="utf-8"))
        uid = entry["scannedThroughUid"]
        validity = entry["uidValidity"]
        if (entry["projectId"] != project_id or type(uid) is not int or
            type(validity) is not int or not 0 <= uid <= 4294967295 or
            not 1 <= validity <= 4294967295):
            raise WatchBlocked("INVALID_CHECKPOINT")
        return {"scannedThroughUid":uid,"uidValidity":validity}
    except (OSError,ValueError,KeyError,TypeError):
        raise WatchBlocked("INVALID_CHECKPOINT") from None

def _write_checkpoint(project_id, cursor, home=None):
    path = _checkpoint_path(project_id, home)
    scanned = cursor.get("scannedThroughUid")
    validity = cursor.get("uidValidity")
    if (type(scanned) is not int or type(validity) is not int or
        not 0 <= scanned <= 4294967295 or not 1 <= validity <= 4294967295):
        raise WatchBlocked("INVALID_CURSOR")
    current = _read_checkpoint(project_id,home)
    if current and current["uidValidity"] == validity and current["scannedThroughUid"] > scanned:
        raise WatchBlocked("CURSOR_REGRESSION")
    path.parent.mkdir(parents=True,exist_ok=True)
    if (path.parent.is_symlink() or
        (hasattr(path.parent,"is_junction") and path.parent.is_junction())):
        raise WatchBlocked("UNSAFE_CHECKPOINT")
    data = {"projectId":project_id,"scannedThroughUid":scanned,"uidValidity":validity,
            "recordedAt":datetime.now(timezone.utc).isoformat()}
    fd, temp = tempfile.mkstemp(prefix="cursor-",suffix=".json",dir=path.parent)
    try:
        with os.fdopen(fd,"w",encoding="utf-8") as stream:
            json.dump(data,stream,separators=(",",":"))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp,path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)

def _heartbeat_due(project_id, home=None, now=None):
    """Process owner-selected OLD-message text within one hour even without new UIDs."""
    path = _checkpoint_path(project_id,home)
    try:
        entry = json.loads(path.read_text(encoding="utf-8"))
        moment = datetime.fromisoformat(entry["recordedAt"])
        if moment.tzinfo is None:
            raise ValueError()
        current = now or datetime.now(timezone.utc)
        age = current - moment.astimezone(timezone.utc)
        if age < timedelta(minutes=-5):
            raise WatchBlocked("CHECKPOINT_CLOCK_INVALID")
        return age >= timedelta(hours=1)
    except WatchBlocked:
        raise
    except Exception:
        raise WatchBlocked("CHECKPOINT_AGE_UNVERIFIED") from None

def next_action(last, health):
    """Only trusted IMAP mailbox UID counters may authorize a sync check."""
    if not isinstance(health,dict) or health.get("status") != "ok":
        return "blocked"
    next_uid = health.get("uidNext")
    validity = health.get("uidValidity")
    if (type(next_uid) is not int or type(validity) is not int or
        not 1 <= next_uid <= 4294967296 or not 1 <= validity <= 4294967295):
        return "blocked"
    if last is None:
        return "needs_bootstrap"
    if validity != last["uidValidity"]:
        return "sync"
    return "sync" if next_uid-1 > last["scannedThroughUid"] else "idle"

def tick(project_id, *,home=None,probe=None,sync=None):
    try:
        if not UUID.fullmatch(project_id):
            raise WatchBlocked("INVALID_PROJECT")
        last = _read_checkpoint(project_id,home)
        health = probe(project_id) if probe else _module("strato-readonly-probe.py","watch_probe").run(project_id)
        action = next_action(last,health)
        if action == "idle" and _heartbeat_due(project_id,home):
            action = "sync"
        if action != "sync":
            return {"status":action,"emailsSent":0,"messagesFetchedByProbe":0}
        outcome = sync(project_id) if sync else _module("strato-inbox-sync-once.py","watch_sync").sync_one(project_id)
        if outcome.get("status") != "ok" or outcome.get("syncResult") not in ("SYNCED","RECOVERED"):
            return {"status":"blocked","reason":"INBOX_SYNC_NOT_CONFIRMED","emailsSent":0}
        cursor = outcome.get("cursor")
        if not isinstance(cursor,dict) or cursor.get("uidValidity") != health["uidValidity"]:
            return {"status":"blocked","reason":"CURSOR_NOT_VERIFIED","emailsSent":0}
        _write_checkpoint(project_id,cursor,home)
        return {"status":"synced","scannedThroughUid":cursor["scannedThroughUid"],
                "emailsSent":0,"messagesFetchedByProbe":0}
    except WatchBlocked as error:
        return {"status":"blocked","reason":str(error),"emailsSent":0}
    except Exception:
        return {"status":"blocked","reason":"READONLY_WATCH_UNAVAILABLE","emailsSent":0}

def bootstrap(project_id, baseline_uid, uid_validity, *,home=None,probe=None):
    try:
        if not UUID.fullmatch(project_id):
            raise WatchBlocked("INVALID_PROJECT")
        if _read_checkpoint(project_id,home) is not None:
            raise WatchBlocked("CHECKPOINT_ALREADY_INITIALIZED")
        if not 0 <= baseline_uid <= 4294967295 or not 1 <= uid_validity <= 4294967295:
            raise WatchBlocked("INVALID_BOOTSTRAP")
        health = probe(project_id) if probe else _module("strato-readonly-probe.py","bootstrap_probe").run(project_id)
        if next_action({"scannedThroughUid":baseline_uid,"uidValidity":uid_validity},health) == "blocked":
            raise WatchBlocked("IMAP_UNAVAILABLE")
        if health.get("uidValidity") != uid_validity or baseline_uid >= health["uidNext"]:
            raise WatchBlocked("BASELINE_SERVER_MISMATCH")
        _write_checkpoint(project_id,{"scannedThroughUid":baseline_uid,"uidValidity":uid_validity},home)
        return {"status":"bootstrapped","scannedThroughUid":baseline_uid,"emailsSent":0}
    except WatchBlocked as error:
        return {"status":"blocked","reason":str(error),"emailsSent":0}
    except Exception:
        return {"status":"blocked","reason":"BOOTSTRAP_UNAVAILABLE","emailsSent":0}

def main(argv=None):
    parser=argparse.ArgumentParser(description="Omnira Strato IMAP-only, conditional one-batch tick")
    parser.add_argument("--project",required=True)
    mode=parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--tick",action="store_true")
    mode.add_argument("--bootstrap",action="store_true")
    parser.add_argument("--baseline-uid",type=int)
    parser.add_argument("--uid-validity",type=int)
    args=parser.parse_args(argv)
    if args.tick:
        if args.baseline_uid is not None or args.uid_validity is not None:
            parser.error("no baseline in tick mode")
        result=tick(args.project)
    else:
        if args.baseline_uid is None or args.uid_validity is None:
            parser.error("explicit verified baseline required")
        result=bootstrap(args.project,args.baseline_uid,args.uid_validity)
    print(json.dumps(result,sort_keys=True))
    return 0 if result["status"] in ("synced","idle","bootstrapped") else 1

if __name__=="__main__":
    sys.exit(main())
