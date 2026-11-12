"""Resolve a spoken destination to a browser URL or an actual Windows Start entry."""
import json
import os
from pathlib import Path
import re
import subprocess
from urllib.parse import urlsplit, urlunsplit

from nova_auto_voice import safe_auto_navigation, spotify_command
from nova_core import normalized
from nova_native_tasks import parse_native_task
from nova_browser_nav import safe_browser_command

OFFICE = "https://omniraos.se/atlas/office"
PORTFOLIO = "https://andrehultgren.se/"
PORTFOLIO_NAME = r"portf(?:ol(?:io|ie|j)|olj)(?:n|en)?"
LEAD = r"^(?:(?:hej nova|nova|perfekt|okej|nej[, ]+men|och)[,!. ]+)*(?:(?:(?:kan|vill|skulle) du(?: kunna)?|(?:jag|vi) vill(?: att du)?|jag skulle vilja) )?"
NAV = re.compile(LEAD + r"(?:öppna(?: upp)?|starta|navigera(?: mig)? till|ta mig till|gå (?:in på|till)|plocka fram|ta fram|visa mig)\b[, ]*(.*)", re.I)
WEB_TOKEN = re.compile(r"(?<![\w@/])(?:(?:https?://)?(?:[\w-]+\.)+[a-zåäö]{2,63}|https?://(?:localhost|(?:\d{1,3}\.){3}\d{1,3}))(?::\d{1,5})?(?:[/#?][^\s,<>]*)?(?![\w@])", re.I)
ANALYZE = re.compile(LEAD + r"(?:analysera|granska|sammanfatta|las(?: upp)?) (?:den har |den aktiva |den oppna )?(?:webb)?(?:sidan|fliken)(?: (?:at|for) mig)?[.!? ]*$")
VOLUME = re.compile(LEAD + r"(?:(?:skruva|dra|vrid|satt) (?P<dir>ner|ned|upp|lagre|hogre)(?: (?:pa|for))? (?:musiken|spotify|volymen|ljudet)|(?P<verb>sank|hoj) (?:musiken|volymen|ljudet)(?: (?:i|pa|for) spotify)?)(?: (?:lite|ett snapp|tack))?[.!? ]*$")
NEWS = re.compile(LEAD + r"(?:(?:las(?: upp)?|ge mig|visa|beratta|spela upp|hora|lyssna pa) (?:de |dagens |senaste |de senaste )*)?(?:news|nyheter(?:na)?)(?: (?:om|inom) (.+))?$")
NAME = re.compile(r"[\wÅÄÖåäö &()+.'-]{1,80}")
NEGATED = re.compile(r"\b(?:inte|aldrig|lat bli|om jag|om du|han sa|hon sa)\b")


def web_url(value):
    if not WEB_TOKEN.fullmatch(value) or any(c in value for c in '\\@"\'<>'):
        return None
    try:
        url = urlsplit(value if "://" in value else "https://" + value)
        host = url.hostname.encode("idna").decode("ascii")
        if not all(re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label) for label in host.split(".")):
            return None
        port = f":{url.port}" if url.port else ""
        return urlunsplit((url.scheme, host + port, url.path or "/", url.query, url.fragment))
    except (AttributeError, ValueError, UnicodeError):
        return None


def destination(text, *, invited=False):
    """Only use addresses actually spoken, or a user's known named destination."""
    clean = text.strip().rstrip(" .!?,…")
    if NEGATED.search(normalized(clean)):
        return None
    match = NAV.fullmatch(clean)
    if match:
        target = match[1].strip(" ,.")
    elif invited or re.fullmatch(r"(?:min|mitt) " + PORTFOLIO_NAME + r"(?: [^ ]+\.[^ ]+)?", normalized(clean)):
        target = clean
    else:
        return None
    if not target:
        return "ask_target", None
    # Folder names and explicit drive paths belong to Explorer, including names with dots.
    path = re.fullmatch(r'(?:mappen |filen )?["”]?([a-z]:[\\/][^"<>|*?]+?)["”]?', target, re.I)
    if path:
        return "local_item", path[1]
    folder = re.fullmatch(r"(?:min |mitt )?(?:projektmapp(?:en)?|projektet) (.+)", target, re.I)
    if folder and NAME.fullmatch(folder[1]):
        return "project_folder", folder[1]
    known = {"skrivbordet": "desktop", "mina dokument": "documents", "hamtade filer": "downloads",
             "nedladdningar": "downloads", "mina hamtade filer": "downloads"}
    if normalized(target) in known:
        return "known_folder", known[normalized(target)]
    if re.match(r"^(?:filen|mappen) ", target, re.I):
        return None
    # Preserve path and query case while accepting the dictated separator.
    target = re.sub(r"(?<=\w) punkt (?=\w)", ".", target, flags=re.I)
    words = normalized(target)
    portfolio = re.search(r"\b" + PORTFOLIO_NAME + r"\b", words)
    tokens = list(WEB_TOKEN.finditer(target))
    if tokens:
        if len(tokens) != 1:
            return "ask_target", None
        token = tokens[0]
        remainder = normalized((target[:token.start()] + " " + target[token.end():]).strip(" ,"))
        if remainder and not re.fullmatch(r"(?:min |mitt )?" + PORTFOLIO_NAME + r"|(?:webb)?(?:sidan|sajten|adressen)", remainder):
            return "ask_target", None
        url = web_url(token.group().rstrip(".!?,"))
        if not url:
            return "ask_target", None
        if portfolio and urlsplit(url).hostname.removeprefix("www.") != urlsplit(PORTFOLIO).hostname:
            return "confirm_url", PORTFOLIO
        return "website", url
    if portfolio and re.fullmatch(r"(?:(?:min|mitt) )?" + PORTFOLIO_NAME, words):
        return "website", PORTFOLIO
    if re.fullmatch(r"(?:(?:omnira(?:s)?|atlas) )?(?:office|kontoret)(?: i omnira)?|omnira[, ]+och (?:navigera(?: mig)?|ga|ta mig) till (?:office|kontoret)", words):
        return "website", OFFICE
    if parse_native_task(text) or safe_auto_navigation(text) or safe_browser_command(text) or spotify_command(text, spotify_selected=True):
        return None
    if re.search(r"\b(?:och|filen|mappen|projektmapp|pa skarmen)\b", words):
        return None
    if invited and words in ("nej", "nej tack", "avbryt", "stopp"):
        return None
    if NAME.fullmatch(target):
        return "app_lookup", re.sub(r"^(?:appen|programmet) ", "", target, flags=re.I)
    return "ask_target", None


def request(text, *, pending=None, last_url=None, spotify=False):
    words = normalized(text).strip(" !?.")
    if NEGATED.search(words):
        return None
    if pending:
        kind, value = pending
        if kind == "confirm_url" and words in ("ja", "ja tack", "precis", "gor det"):
            return "website", value
        if kind == "which_volume" and words in ("ja", "ja tack", "spotify"):
            return "volume", value
        if kind == "news_topic":
            topic = re.fullmatch(r"(?:(?:jag vill |vill jag )?(?:hora|lyssna)(?: pa)? (?:den |det )?(?:om )?|(?:nyheter )?om )?([\w -]{1,75})", words)
            if topic and len(topic[1].split()) <= 5 and not NAV.match(text) and not re.search(r"\b(?:kan du|vill du|avbryt|nej|sluta|vad|pausa|analysera|inget|inte)\b", words):
                return "news", " ".join(text.strip(" .!?").split()[-len(topic[1].split()):])
    news = NEWS.fullmatch(words)
    if news:
        return ("news", re.split(r"\s+(?:om|inom)\s+", text.strip(" .!?"), maxsplit=1, flags=re.I)[-1]) if news[1] else ("news_topic", None)
    if ANALYZE.fullmatch(words):
        return "analyze", None if "aktiva" in words or "den har" in words else last_url
    vol = VOLUME.fullmatch(words)
    if vol:
        direction = "down" if (vol["dir"] or vol["verb"]) in ("ner", "ned", "lagre", "sank") else "up"
        return ("volume" if spotify or re.search(r"musik|spotify", words) else "which_volume"), direction
    link = re.fullmatch(LEAD + r"(?:folj|oppna|klicka pa) (?:den synliga )?lanken (?:till )?([\w -]{1,80})", words)
    if link:
        return "link", link[1]
    nested = re.fullmatch(r"(.+?) och (?:navigera(?: mig)?|ga(?: vidare)?|ta mig) till ([\w -]{1,80})[.!? ]*", normalized(text))
    if nested:
        original_parent = re.split(r"\s+och\s+", text, maxsplit=1, flags=re.I)[0]
        parent_request = NAV.fullmatch(original_parent)
        if parent_request and normalized(parent_request[1]) == "omnira":
            if nested[2] in ("office", "omnira office", "kontoret"):
                return "website", OFFICE
            return "website_link", ("https://omniraos.se/dashboard", nested[2])
        parent = destination(original_parent)
        if parent and parent[0] == "website":
            return "website_link", (parent[1], nested[2])
    if last_url and re.fullmatch(LEAD + r"(?:ta (?:mig )?in dar|ga (?:in )?dar|oppna den igen|fortsatt till sidan)", words):
        return "website", last_url
    # A single request can name a destination and ask to inspect its content.
    parts = re.split(r"\s+och\s+(?=(?:analysera|sammanfatta|granska)\b)", text, maxsplit=1, flags=re.I)
    if len(parts) == 2 and ANALYZE.fullmatch(normalized(parts[1])):
        resolved = destination(parts[0])
        if resolved and resolved[0] == "website":
            return "website_analyze", resolved[1]
    return destination(text, invited=bool(pending and pending[0] == "ask_target"))


def start_entries():
    shell = Path(os.environ["SystemRoot"]) / "System32/WindowsPowerShell/v1.0/powershell.exe"
    cmd = "[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); ConvertTo-Json -Compress -InputObject @(Get-StartApps | Select-Object Name,AppID)"
    result = subprocess.run([str(shell), "-NoProfile", "-NonInteractive", "-Command", cmd],
                            capture_output=True, encoding="utf-8", timeout=7, check=True,
                            creationflags=subprocess.CREATE_NO_WINDOW)
    return json.loads(result.stdout)


def match_entries(query, entries):
    key = normalized(query)
    exact = [app for app in entries if normalized(app["Name"]) == key]
    if exact:
        return exact
    return [app for app in entries if re.search(r"(?<!\w)" + re.escape(key) + r"(?:n|en)?(?!\w)", normalized(app["Name"]))]
