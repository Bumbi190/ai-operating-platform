"""Explicit foreground CLI candidate. No URI installation or background service."""
import sys
import threading
import webbrowser
from office_launcher import WindowsBackend,default_target
from office_pairing import check_native
from office_visit_client import OfficeVisitClient
from office_visit_process import acquire_office_process
from office_visit_relay import OfficeVisitRelay


def main(args):
    if args!=['--visit']:
        print('Använd --visit utan extra argument.');return 1
    relay=lease=None
    try:
        target=default_target();output=check_native(target)
        # Acquire the exact existing writer lease BEFORE launching game/browser/listener.
        relay=OfficeVisitRelay(output,None,OfficeVisitClient())
        output.mkdir(parents=True,exist_ok=True);relay._acquire_writer()
        lease=acquire_office_process(target,WindowsBackend());relay.process=lease
        # start() retains this same lease; it must not acquire a competing handle.
        relay.start()
        if not webbrowser.open(relay.pairing_url()):raise RuntimeError('Browser unavailable')
        print('Välj agent och Anslut för kontorsbesöket på sidan. Ctrl+C avslutar anslutningen.')
        while not relay._halt.wait(.25):pass
        return 0
    except KeyboardInterrupt:return 0
    except Exception:
        print('Office-besöket kunde inte verifieras. Ingen aktiv anslutning bekräftad.');return 1
    finally:
        if relay:relay.stop()
        if lease:lease.close()


if __name__=='__main__':raise SystemExit(main(sys.argv[1:]))
