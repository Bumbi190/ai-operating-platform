"""Uninstalled foreground workflow visit candidate; no URI or service changes.
Refuses before game/browser/listener/output changes unless the canonical native
workflow consumer and this exact source set have accepted integrity receipts.
"""
from pathlib import Path
import sys
sys.dont_write_bytecode = True

def main(args):
    if args != ['--workflow-visit']:
        print('Använd --workflow-visit utan extra argument.');return 1
    relay=lease=None
    try:
        from office_launcher import WindowsBackend, default_target
        from office_workflow_native_guard import check_workflow_native
        target=default_target()
        output=check_workflow_native(target,Path(__file__).resolve().parent)
        from office_visit_client import OfficeVisitClient
        from office_visit_process import acquire_office_process
        from office_visit_relay import OfficeVisitRelay
        import webbrowser
        relay=OfficeVisitRelay(output,None,OfficeVisitClient(),workflow=True)
        output.mkdir(parents=True,exist_ok=True);relay._acquire_writer()
        lease=acquire_office_process(target,WindowsBackend());relay.process=lease
        relay.start()
        if not webbrowser.open(relay.pairing_url()):raise RuntimeError('Browser unavailable')
        print('Välj agent och arbets- och fritidsstatus på sidan. Ctrl+C avslutar besöket.')
        while not relay._halt.wait(.25):pass
        return 0
    except KeyboardInterrupt:return 0
    except Exception:
        print('Office-mottagaren för workflowstatus kunde inte verifieras. Ingen anslutning aktiverad.')
        return 1
    finally:
        if relay:relay.stop()
        if lease:lease.close()

if __name__=='__main__':raise SystemExit(main(sys.argv[1:]))
