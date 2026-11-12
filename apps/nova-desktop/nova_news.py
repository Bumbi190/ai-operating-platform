"""Fetch recent Swedish-language headlines for the topic named by the speaker."""
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET


def headlines(topic):
    query = urlencode({"q": topic[:100] + " when:7d", "hl": "sv", "gl": "SE", "ceid": "SE:sv"})
    request = Request("https://news.google.com/rss/search?" + query, headers={"User-Agent": "NovaDesktop/1.0"})
    with urlopen(request, timeout=7) as response:
        if response.status != 200:
            raise ValueError("news_http_error")
        data = response.read(1_048_577)
    if len(data) > 1_048_576:
        raise ValueError("news_feed_too_large")
    return parse_headlines(data, datetime.now(timezone.utc))


def parse_headlines(data, now):
    items = []
    seen = set()
    for item in ET.fromstring(data).findall("./channel/item"):
        title = (item.findtext("title") or "").strip()
        source = (item.findtext("source") or "").strip()
        try:
            date = parsedate_to_datetime(item.findtext("pubDate") or "").astimezone(timezone.utc)
        except (TypeError, ValueError, OverflowError):
            continue
        if not source or not title or not now - timedelta(days=7) <= date <= now:
            continue
        title = title.removesuffix(" - " + source)
        if title in seen:
            continue
        seen.add(title)
        items.append((date, source, title))
    result = sorted(items, reverse=True)[:3]
    if not result:
        return "Jag hittade inga daterade rubriker om det ämnet den senaste veckan."
    return " ".join(f"{source} den {date.day}/{date.month}: {title.rstrip('.')}." for date, source, title in result)
