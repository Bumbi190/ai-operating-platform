"""A desktop inbox and reviewed reply. Credentials stay with the Windows user."""
from dataclasses import dataclass, replace
from email import policy
from email.message import EmailMessage
from email.parser import BytesParser
from email.utils import formatdate, make_msgid
from html.parser import HTMLParser
import imaplib
import json
import os
from pathlib import Path
import re
import smtplib
import ssl
import tempfile

from nova_sanna import _protect

SERVERS = {"Gmail": ("imap.gmail.com", "smtp.gmail.com"),
           "Strato": ("imap.strato.de", "smtp.strato.de")}
MAX_MESSAGE = 4 * 1024 * 1024
PREFIX = r"^(?:(?:hej|okej)[, ]+)?(?:nova\b[,:!?. ]*)?(?:(?:kan|vill|skulle) du (?:kunna |vilja )?)?"
ADDRESS = re.compile(r"[^\s@<>,;:\x00-\x1f]+@[^\s@<>,;:\x00-\x1f]+\.[^\s@<>,;:\x00-\x1f]+")
MESSAGE_ID = re.compile(r"<[^<>\s\x00-\x1f]+>")


class MailError(ValueError):
    pass


def account_in(text):
    names = [name for name in SERVERS if re.search(r"\b" + name + r"\b", text, re.I)]
    return names[0] if len(names) == 1 else None


def intent(text, active=False):
    phrase = re.sub(PREFIX, "", text.strip(), flags=re.I)
    action = phrase.rstrip(" .!?").casefold()
    if re.fullmatch(r"(?:anslut|koppla|ställ in) (?:min |mitt )?(?:gmail|strato)(?:[- ]?(?:mejl|mail|konto))?", action):
        return "setup", account_in(action)
    noun = r"(?:mejl(?:et)?|mail(?:et)?|meddelande(?:t)?|e-post(?:en)?)"
    read = r"(?:läs(?:a)?(?: upp)?|visa|öppna) "
    where = r"(?: (?:i|på|från) (?:min |mitt )?(gmail|strato))?"
    if re.fullmatch(read + r"(?:det |mitt )?senaste " + noun + where, action):
        return "latest", account_in(action)
    found = re.fullmatch(read + r"(?:det )?(senaste )?" + noun + r" (?:om|med ämnet) (.+?)" + where, phrase.rstrip(".!?"), re.I)
    if found:
        return ("latest_subject" if found[1] else "subject"), (account_in(found[3] or ""), found[2].strip(' .”"'))
    if re.fullmatch(read + r"(?:(?:det här|detta) " + noun + "|" + noun + r" (?:som jag har öppet|på skärmen))" + where, action):
        return "visible_mail", account_in(action)
    if re.fullmatch(r"(?:läs(?:a)?(?: upp)?|visa) (?:ett |mitt )?" + noun + where, action):
        return "choose", account_in(action)
    send = r"(?:(?:ja|det ser bra ut)[,. ]+)?skicka(?: iväg)? (?:det (?:granskade )?svaret|svaret|(?:mitt |detta )?svar|utkastet)(?: nu| tack)?"
    if re.fullmatch(send, action) or (active and action in ("skicka", "skicka det", "ja, skicka det")):
        return "send", None
    if active:
        if action in ("kasta utkastet", "släng utkastet", "avbryt mejlsvaret"):
            return "discard", None
        for verb, pattern in (("draft", r"(?:svara(?: (?:honom|henne|dem))?(?: att| så här)?|skriv (?:ett )?svar(?: att)?|skriv att|(?:ändra|byt) (?:svaret|utkastet) till)"),
                              ("append", r"lägg till(?: i (?:svaret|utkastet))?"),
                              ("remove", r"ta bort(?: ur (?:svaret|utkastet))?")):
            m = re.fullmatch(pattern + r"[\s,:]+(.+)", phrase, re.I | re.S)
            if m:
                return verb, m[1].strip()
    return None


def credentials_path(account):
    if account not in SERVERS:
        raise MailError("Välj Gmail eller Strato.")
    return Path(os.environ["LOCALAPPDATA"]) / "Omnira" / "Nova" / ("mail-" + account + ".dpapi")


def save_account(account, address, secret):
    if not ADDRESS.fullmatch(address) or not secret:
        raise MailError("Ange en fullständig mejladress och ett lösenord.")
    path = credentials_path(account)
    path.parent.mkdir(exist_ok=True, parents=True)
    encrypted = _protect(json.dumps([address, secret]).encode(), decrypt=False)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as tmp:
        temp_path = Path(tmp.name)
        tmp.write(encrypted)
    try:
        os.replace(temp_path, path)
    finally:
        temp_path.unlink(missing_ok=True)


def get_account(account):
    path = credentials_path(account)
    if not path.is_file():
        raise MailError(f"Anslut {account} i Novas meny först.")
    return json.loads(_protect(path.read_bytes(), decrypt=True))


class BodyText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("style", "script"):
            self.hidden += 1
        if tag in ("p", "br", "div", "li", "tr"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("style", "script") and self.hidden:
            self.hidden -= 1

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


@dataclass(frozen=True)
class Mail:
    provider: str
    account: str
    sender: str
    recipient: str
    subject: str
    message_id: str
    references: str
    body: str


def decode_message(provider, account, raw):
    message = BytesParser(policy=policy.default).parsebytes(raw)
    reply = message.get("Reply-To") or message.get("From")
    addresses = getattr(reply, "addresses", ())
    recipient = addresses[0].addr_spec if len(addresses) == 1 and not reply.defects else ""
    if not ADDRESS.fullmatch(recipient):
        recipient = ""
    body = message.get_body(preferencelist=("plain", "html"))
    content = body.get_content() if body else ""
    if body and body.get_content_subtype() == "html":
        parser = BodyText()
        parser.feed(content)
        content = "".join(parser.parts)
    msgid = str(message.get("Message-ID", ""))
    refs = MESSAGE_ID.findall(str(message.get("References", "")))[-12:]
    return Mail(provider, account, str(message.get("From") or ""), recipient,
                " ".join(str(message.get("Subject") or "(utan ämne)").splitlines()),
                msgid if MESSAGE_ID.fullmatch(msgid) else "", " ".join(refs), content.strip())


def read_inbox(provider, subject=None, *, latest_match=False, visible=None):
    address, secret = get_account(provider)
    with imaplib.IMAP4_SSL(SERVERS[provider][0], 993, ssl_context=ssl.create_default_context(), timeout=15) as box:
        box.login(address, secret)
        status, count = box.select("INBOX", readonly=True)
        if status != "OK" or not count or not count[0]:
            raise MailError("Inkorgen gick inte att öppna.")
        if count[0] == b"0":
            raise MailError("Inkorgen är tom.")
        if visible is not None:
            # Require a visible subject and body excerpt from the same message.
            # An inbox listing or a browser tab title alone cannot select a recipient.
            first = max(1, int(count[0]) - 24)
            status, rows = box.fetch(f"{first}:{int(count[0])}", "(UID BODY.PEEK[HEADER.FIELDS (SUBJECT)])")
            page = " ".join(visible.casefold().split())
            candidates = []
            for row in rows if status == "OK" else ():
                if not isinstance(row, tuple):
                    continue
                uid = re.search(rb"\bUID (\d+)\b", row[0])
                header = BytesParser(policy=policy.default).parsebytes(row[1]).get("Subject", "")
                title = " ".join(str(header).casefold().split())
                if uid and title and title in page:
                    candidates.append(uid[1])
            if not 1 <= len(candidates) <= 4:
                raise MailError("Jag kunde inte knyta skärmtexten till ett mejl. Ange mejlets ämne.")
            matches = []
            for uid in candidates:
                candidate = fetch_mail(box, uid, provider, address)
                excerpt = " ".join(candidate.body.casefold().split())[:100]
                if len(excerpt) >= 12 and excerpt in page:
                    matches.append(candidate)
            if len(matches) != 1:
                raise MailError("Jag kunde inte välja ett entydigt mejl från skärmen. Ange mejlets ämne.")
            return matches[0]
        if subject is None:
            status, data = box.fetch(count[0], "(UID)")
            uid = re.search(rb"\bUID (\d+)\b", data[0]) if status == "OK" and isinstance(data[0], bytes) else None
            ids = [uid[1]] if uid else []
        else:
            if not subject.strip() or len(subject) > 240 or any(ord(c) < 32 for c in subject):
                raise MailError("Ange ett kort ämne på en rad.")
            box.literal = subject.encode("utf-8")
            status, data = box.uid("SEARCH", "CHARSET", "UTF-8", "SUBJECT")
            if status != "OK":
                raise MailError("Inkorgen kunde inte söka efter ämnet.")
            ids = data[0].split() if data and data[0] else []
        if not ids:
            raise MailError("Jag hittade inget sådant mejl i inkorgen.")
        if len(ids) > 1 and not latest_match:
            raise MailError("Flera mejl matchar. Ange ett mer specifikt ämne eller säg ”läs senaste mejlet om” följt av ämnet.")
        return fetch_mail(box, max(ids, key=int), provider, address)


def fetch_mail(box, uid, provider, address):
    status, data = box.uid("FETCH", uid, f"(BODY.PEEK[]<0.{MAX_MESSAGE + 1}>)")
    raw = next((row[1] for row in data if isinstance(row, tuple)), None) if status == "OK" else None
    if raw is None or len(raw) > MAX_MESSAGE:
        raise MailError("Mejlet är för stort eller kunde inte läsas.")
    return decode_message(provider, address, raw)


@dataclass(frozen=True)
class Draft:
    source: Mail
    text: str

    @property
    def subject(self):
        return self.source.subject if self.source.subject.casefold().startswith("re:") else "Re: " + self.source.subject

    def preview(self):
        return f"Från: {self.source.account}\nTill: {self.source.recipient}\nÄmne: {self.subject}\n\n{self.text}"

    def edit(self, operation, value):
        if operation == "remove" and self.text.count(value) != 1:
            raise MailError("Texten att ta bort behöver finnas exakt en gång i utkastet.")
        text = {"append": lambda: self.text + "\n" + value, "remove": lambda: self.text.replace(value, "", 1),
                "draft": lambda: value}[operation]().strip()
        if not text or len(text) > 12000:
            raise MailError("Svaret behöver innehålla mellan 1 och 12 000 tecken.")
        return replace(self, text=text)


class DeliveryUncertain(MailError):
    pass


def deliver(draft):
    mail = draft.source
    address, secret = get_account(mail.provider)
    if address != mail.account or not ADDRESS.fullmatch(mail.recipient):
        raise MailError("Mejlkontot eller mottagaren har ändrats. Läs mejlet igen.")
    reply = EmailMessage(policy=policy.SMTP)
    reply["From"], reply["To"], reply["Subject"] = address, mail.recipient, draft.subject
    reply["Date"], reply["Message-ID"] = formatdate(localtime=True), make_msgid()
    if mail.message_id:
        reply["In-Reply-To"] = mail.message_id
        reply["References"] = (mail.references + " " + mail.message_id).strip()
    reply.set_content(draft.text)
    server = smtplib.SMTP_SSL(SERVERS[mail.provider][1], 465, context=ssl.create_default_context(), timeout=20)
    try:
        server.login(address, secret)
        try:
            refused = server.send_message(reply, from_addr=address, to_addrs=[mail.recipient])
        except (smtplib.SMTPServerDisconnected, TimeoutError, OSError) as exc:
            if isinstance(exc, (smtplib.SMTPResponseException, smtplib.SMTPRecipientsRefused)):
                raise MailError("Mejlservern avvisade svaret.") from exc
            raise DeliveryUncertain("Anslutningen bröts vid sändning. Kontrollera hos mejlleverantören innan du skickar igen.") from exc
        if refused:
            raise MailError("Mejlservern avvisade mottagaren.")
    finally:
        server.close()
