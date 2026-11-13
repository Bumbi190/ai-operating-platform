import json,ssl,smtplib,imaplib
from datetime import datetime,timezone
from pathlib import Path
context=ssl.create_default_context()
context.minimum_version=ssl.TLSVersion.TLSv1_2
result={"observedAt":datetime.now(timezone.utc).isoformat(),"authenticationAttempted":False,"mailRead":False,"mailSent":False}
try:
    with smtplib.SMTP_SSL("smtp.strato.de",465,timeout=10,context=context) as client:
        code,_=client.ehlo()
        result["smtp"]={"tcpTls":True,"tlsVersion":client.sock.version(),"certificateVerified":True,"ehlo":code,"authMechanisms":client.esmtp_features.get("auth","").split()}
except Exception as e:result["smtp"]={"tcpTls":False,"errorCode":type(e).__name__}
try:
    client=imaplib.IMAP4_SSL("imap.strato.de",993,ssl_context=context,timeout=10)
    try:
        code,data=client.capability()
        caps=b" ".join(data).decode("ascii",errors="replace").split()
        result["imap"]={"tcpTls":True,"tlsVersion":client.sock.version(),"certificateVerified":True,"capabilityStatus":code,"authMechanisms":[x for x in caps if x.upper().startswith("AUTH=")]}
    finally:client.logout()
except Exception as e:result["imap"]={"tcpTls":False,"errorCode":type(e).__name__}
Path(__file__).with_name("strato-tls-preflight.json").write_bytes((json.dumps(result,indent=2)+"\n").encode())
print(json.dumps(result))
