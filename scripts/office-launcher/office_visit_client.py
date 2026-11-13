"""Fixed HTTPS exchange in a disposable worker: bounded DNS, TLS and body read."""
import http.client
import json
import multiprocessing
import ssl
import time
from office_relay import _no_duplicate_keys


def _https_read(path,visit,secret,cancelled):
    connection=http.client.HTTPSConnection('omniraos.se',443,timeout=5,context=ssl.create_default_context())
    try:
        connection.connect()
        if cancelled.is_set():raise RuntimeError('Office visit stopped')
        connection.request('POST','/api/atlas/office/visits/'+path,
            body=json.dumps({'visitId':visit}),headers={'Content-Type':'application/json','X-Omnira-Office-Visit':secret})
        response=connection.getresponse()
        if response.status!=200:raise RuntimeError('Office visit unavailable')
        data=response.read(32769)
        if len(data)>32768 or cancelled.is_set():raise ValueError('Office response unavailable')
        return json.loads(data.decode('utf-8'),object_pairs_hook=_no_duplicate_keys,
                          parse_constant=lambda _:(_ for _ in ()).throw(ValueError('Nonfinite JSON')))
    finally:connection.close()


def _worker(pipe,cancelled,path,visit,secret):
    try:pipe.send(('ok',_https_read(path,visit,secret,cancelled)))
    except Exception:pipe.send(('error',None))
    finally:pipe.close()


def _run_bounded(worker,args,permitted):
    # Socket timeouts do not bound DNS or a close-delimited response. A held
    # worker can be terminated even if either operation never returns.
    context=multiprocessing.get_context('spawn')
    reader,sender=context.Pipe(duplex=False);cancelled=context.Event()
    child=context.Process(target=worker,args=(sender,cancelled,*args),daemon=True)
    deadline=time.monotonic()+4.4  # Reserve600ms for termination/join within5s.
    try:
        if not permitted():raise RuntimeError('Office visit stopped')
        child.start();sender.close()
        while time.monotonic()<deadline:
            if not permitted():raise RuntimeError('Office visit stopped')
            if reader.poll(min(.05,max(0,deadline-time.monotonic()))):
                state,result=reader.recv()
                if state!='ok' or not permitted() or time.monotonic()>=deadline:raise RuntimeError('Office visit unavailable')
                return result
            if not child.is_alive():raise RuntimeError('Office visit unavailable')
        raise RuntimeError('Office visit unavailable')
    except (OSError,EOFError):raise RuntimeError('Office visit unavailable') from None
    finally:
        cancelled.set();reader.close();sender.close()
        if child.pid is not None:
            if child.is_alive():child.terminate()
            child.join(timeout=.3)
            if child.is_alive():child.kill();child.join(timeout=.3)
            if not child.is_alive():child.close()


class OfficeVisitClient:
    def presence(self,visit,secret,permitted):return _run_bounded(_worker,('presence',visit,secret),permitted)
    def revoke(self,visit,secret):return _run_bounded(_worker,('revoke',visit,secret),lambda:True)
