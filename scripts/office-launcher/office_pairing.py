"""Explicit foreground pairing for the approved private Windows Office.

Local candidate only: the protected web route must be released before --pair is
offered to the owner. --check performs no network/browser/output-directory write.
No service, protocol change, stored login, workflow execution or voice session.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
import threading
import webbrowser

from office_install_guard import GuardError, verify_artifacts
from office_launcher import OFFICE_MAP, OfficeTarget, OfficeUnavailable, default_target
from office_relay import OfficeRelay

AVATAR = 'office-familje-pling'
STATUS = 'verified_local_identity_consumer'
SOURCES = Path(__file__).resolve().parent


class PairingUnavailable(RuntimeError):
    """A safe user-facing diagnostic; never includes a browser URL or key."""


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check_native(target: OfficeTarget) -> Path:
    """Check recorded local integrity. This is not backend authentication."""
    try:
        target.verify()
        project = target.project.parent
        evidence = project / 'Saved/OfficePresenceSetup'
        manifest = json.loads((evidence / 'installation.json').read_text(encoding='utf-8'))
        audit = json.loads((evidence / 'fresh_process_audit.json').read_text(encoding='utf-8'))
        if not isinstance(manifest, dict) or not isinstance(audit, dict):
            raise ValueError('Invalid local evidence')
        if (manifest.get('installed') is not True or manifest.get('status') != STATUS
                or manifest.get('fresh_process_verified') is not True
                or manifest.get('runtime_pause_expiry_verified') is not True
                or audit.get('installed') is not True or audit.get('passed') is not True
                or audit.get('fresh_process') is not True or audit.get('status') != STATUS
                or manifest.get('avatar_id') != AVATAR
                or manifest.get('linked_actor') != 'SkeletalMeshActor_3'
                or manifest.get('linked_actor_label') != 'Pling | Familje'):
            raise ValueError('Native installation is not accepted')
        asset = project / 'Content/OmniraGameplayV83/PrivatePresence/BP_OfficePrivatePresence.uasset'
        verify_artifacts(manifest, source=SOURCES / 'install_unreal_presence.py', asset=asset, project=target.project)
        if digest(target.project) != manifest.get('project_after_sha256'):
            raise ValueError('Project descriptor changed after native acceptance')
        map_hash = digest(project / ('Content' + OFFICE_MAP[5:] + '.umap'))
        if (map_hash != manifest.get('map_after_sha256') or map_hash != audit.get('map_sha256')
                or audit.get('asset_sha256') != manifest.get('asset_sha256')
                or audit.get('source_sha256') != manifest.get('source_sha256')):
            raise ValueError('Native world changed after verification')
        presentation, visual = manifest.get('presentation'), audit.get('presentation')
        if not isinstance(presentation, dict) or not isinstance(visual, dict):
            raise ValueError('Readable label is not verified')
        material_hash = digest(asset.with_name('M_OfficePresenceText.uasset'))
        if (material_hash != presentation.get('material_sha256')
                or material_hash != visual.get('material_sha256')
                or presentation.get('source_sha256') != digest(SOURCES / 'style_unreal_presence.py')
                or visual.get('unlit') is not True or visual.get('font_mask') is not True):
            raise ValueError('Native label changed after verification')
        return project / 'Saved/OfficePresence'
    except (OfficeUnavailable, GuardError, OSError, ValueError, TypeError, KeyError, AttributeError):
        raise PairingUnavailable('Office-mottagaren kunde inte verifieras. Kontrollera den sparade installationen innan parkoppling.') from None


def run_pairing(target: OfficeTarget, opener, stop_event: threading.Event) -> None:
    """Own the relay lifecycle; only the external browser boundary is replaceable."""
    output = check_native(target)  # Before opening a port or creating the output directory.
    relay = OfficeRelay(output, avatars=(AVATAR,))
    try:
        try:
            relay.start()
            if not opener(relay.pairing_url()):
                raise PairingUnavailable('Webbläsaren kunde inte öppnas.')
            print('Office-bryggan är igång. Välj agent på anslutningssidan. Avsluta med Ctrl+C eller stäng detta fönster.')
            try:
                while not stop_event.wait(0.25):
                    pass  # Return to Python so Windows can dispatch Ctrl+C (including CPython <3.14).
            except KeyboardInterrupt:
                pass
        finally:
            relay.stop()  # Normal exit clears identity; native expiry covers abrupt process death.
    except Exception:
        # A browser can raise an exception containing its complete URL. Never echo it.
        raise PairingUnavailable('Parkopplingen kunde inte starta eller avslutas korrekt. Kontrollera att ingen annan Office-brygga är igång och försök igen.') from None


def main(args: list[str]) -> int:
    try:
        if args not in (['--check'], ['--pair']):
            raise PairingUnavailable('Använd --check eller --pair utan extra argument.')
        target = default_target()
        if args == ['--check']:
            check_native(target)
            status = 'native_receiver_ready'
        else:
            run_pairing(target, webbrowser.open, threading.Event())
            status = 'stopped'
        print(json.dumps({'status': status, 'web_pairing_verified': False,
                          'voice_connected': False, 'workflow_execution_verified': False}))
        return 0
    except (PairingUnavailable, OSError):
        print(json.dumps({'status': 'unavailable', 'web_pairing_verified': False,
                          'message': 'Office-parkopplingen är inte tillgänglig. Kontrollera startargument, installation och eventuell annan brygga.'}, ensure_ascii=True))
        return 1


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
