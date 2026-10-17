import threading
import uuid
from datetime import datetime,timezone
from .research import fetch_contact_homepage,ResearchError
def run_once(client,adapter):
    claim=client.post('claim');ref=claim.get('ref')
    if not ref:return False
    stop=threading.Event();heartbeat_done=threading.Event()
    def heartbeat():
        while not heartbeat_done.wait(15):
            try:client.post('heartbeat',**ref)
            except Exception:stop.set();return
    thread=threading.Thread(target=heartbeat,daemon=True);thread.start()
    try:
        snapshot=claim['snapshot'];contacts=snapshot['contacts'];offer=snapshot['offer']
        if not isinstance(contacts,list) or not 1<=len(contacts)<=5 or len({x['id'] for x in contacts})!=len(contacts):raise ValueError('INVALID_JOB')
        drafts=[]
        for contact in contacts:
            if stop.is_set():raise ValueError('CANCELLED')
            evidence=None;question=None
            if contact.get('websiteUrl'):
                try:evidence=fetch_contact_homepage(contact['websiteUrl'])
                except ResearchError:question='Webbplatsen kunde inte verifieras. Granska kontaktunderlaget.'
            receipt=client.post('commit_research',**ref,contactId=contact['id'],evidence=evidence,question=question)
            sources=[{'id':receipt['evidenceId'],**receipt['evidence']}] if receipt.get('evidenceId') and receipt.get('evidence') else []
            permit=client.post('reserve_attempt',**ref,contactId=contact['id'],attemptId=str(uuid.uuid4()))
            if datetime.fromisoformat(permit['dispatchBefore'].replace('Z','+00:00'))<=datetime.now(timezone.utc):raise ValueError('PERMIT_EXPIRED')
            draft=adapter.prepare(contact,offer,sources,permit,stop)
            if receipt.get('question') and receipt['question'] not in draft['questions']:draft['questions'].append(receipt['question'])
            drafts.append(draft)
        if stop.is_set():raise ValueError('CANCELLED')
        client.post('complete',**ref,drafts=drafts);return True
    except Exception:
        try:client.post('report_failure',**ref)
        except Exception:pass
        return False
    finally:heartbeat_done.set();thread.join(timeout=21)
