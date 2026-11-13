"""Bounded public homepage reads. Model output never selects a URL."""
import hashlib
import http.client
import ipaddress
import socket
import ssl
from datetime import datetime,timezone
from html.parser import HTMLParser
from urllib.parse import urlsplit

class ResearchError(Exception): pass
def validate_public_url(url):
    try:
        u=urlsplit(url)
        if u.scheme!='https' or not u.hostname or u.username or u.password or u.port not in (None,443) or u.fragment: raise ResearchError('UNSAFE_SOURCE')
        answers=socket.getaddrinfo(u.hostname,443,type=socket.SOCK_STREAM)
        ips=[x[4][0] for x in answers]
        if not ips or any(not ipaddress.ip_address(x).is_global for x in ips): raise ResearchError('NON_PUBLIC_SOURCE')
        return u,ips[0]
    except ResearchError: raise
    except Exception: raise ResearchError('SOURCE_UNAVAILABLE') from None
class _Text(HTMLParser):
    def __init__(self): super().__init__();self.skip=0;self.parts=[]
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style','form','noscript','svg'): self.skip+=1
    def handle_endtag(self,tag):
        if tag in ('script','style','form','noscript','svg') and self.skip: self.skip-=1
    def handle_data(self,data):
        if not self.skip and data.strip(): self.parts.append(data.strip())
def extract_text(html):
    p=_Text();p.feed(html);value=' '.join(' '.join(p.parts).split())
    return value.encode('utf-8')[:8192].decode('utf-8',errors='ignore').strip()
class _PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self,host,ip): super().__init__(host,443,timeout=10,context=ssl.create_default_context());self.ip=ip
    def connect(self):
        raw=socket.create_connection((self.ip,443),timeout=10)
        try:self.sock=self._context.wrap_socket(raw,server_hostname=self.host)
        except BaseException:raw.close();raise
def fetch_contact_homepage(url):
    u,ip=validate_public_url(url);conn=_PinnedHTTPS(u.hostname,ip)
    try:
        conn.request('GET',(u.path or '/')+('?' + u.query if u.query else ''),headers={'Host':u.hostname,'User-Agent':'OmniraSalesResearch/1.0','Accept':'text/html','Accept-Encoding':'identity'})
        r=conn.getresponse()
        if r.status!=200 or 'text/html' not in r.getheader('Content-Type','').lower(): raise ResearchError('SOURCE_UNAVAILABLE')
        raw=r.read(65537)
        if len(raw)>65536: raise ResearchError('SOURCE_TOO_LARGE')
        value=extract_text(raw.decode('utf-8',errors='replace'))
        if not value: raise ResearchError('SOURCE_EMPTY')
        return {'sourceUrl':url,'observedAt':datetime.now(timezone.utc).isoformat(),'text':value,'sha256':hashlib.sha256(value.encode()).hexdigest()}
    except ResearchError:raise
    except Exception:raise ResearchError('SOURCE_UNAVAILABLE') from None
    finally:conn.close()
