"""Constrained voice handoff to Omnira's authenticated Campaign Planner review.

This NEVER calls the planner API, never creates a run, and never publishes.
The browser page requires authenticated user approval before it may POST.
"""
from __future__ import annotations

from datetime import date
import re
from urllib.parse import urlencode

from nova_core import Action, normalized
from nova_bridge import validate_pairing_origin, PROD_ORIGIN

_MONTHS = {
    "januari": 1, "februari": 2, "mars": 3, "april": 4,
    "maj": 5, "juni": 6, "juli": 7, "augusti": 8,
    "september": 9, "oktober": 10, "november": 11, "december": 12,
}
_PRE = re.compile(r"^(?:(?:hej|halla)\s+)?(?:nova[,:\s]+)?(?:(?:kan|vill|skulle)\s+du\s+)?")
_COMMAND = re.compile(
    r"^(?:planera|forbered)\s+"
    r"(?:content|innehall|inlagg|sociala medier)\s+"
    r"(?:for|till)\s+"
    r"(?:familje stunden|familje-stunden|familjestunden)"
    r"(?:\s+(?:i|for)\s+(?P<month>[a-z]+)(?:\s+(?P<year>20\d{2}))?)?$"
)
_PUNCT = re.compile(r"[.!?,:;]+$")


def campaign_review_intent(text: str, *, today: date | None = None) -> Action | None:
    if not isinstance(text, str) or len(text) > 160:
        return None
    s = normalized(text)
    s = _PUNCT.sub("", s).strip()
    s = _PRE.sub("", s, count=1)
    match = _COMMAND.fullmatch(s)
    if not match:
        return None
    month_name = match.group("month")
    if month_name and month_name not in _MONTHS:
        return None
    month = ""
    if month_name:
        today = today or date.today()
        month_number = _MONTHS[month_name]
        explicit_year = match.group("year")
        year = int(explicit_year) if explicit_year else (
            today.year if month_number >= today.month else today.year + 1
        )
        value = date(year, month_number, 1)
        current = date(today.year, today.month, 1)
        months_ahead = (value.year - current.year) * 12 + value.month - current.month
        if months_ahead < 0 or months_ahead > 12:
            return None
        month = value.strftime("%Y-%m")
    return Action(
        "campaign_review", month,
        "Granska Campaign Planner-beställning för Familje-Stunden; ingen körning startas",
    )


def campaign_review_url(origin: str, month: str = "") -> str:
    verified = validate_pairing_origin(origin)
    if verified == PROD_ORIGIN:
        # Production launch page is not deployed yet. Prevent broken links.
        raise ValueError("Campaign launch is not deployed to production")
    if month and not re.fullmatch(r"20\d{2}-(0[1-9]|1[0-2])", month):
        raise ValueError("Invalid target month")
    path = verified + "/nova-actions/marketing"
    return path + ("?" + urlencode({"month": month}) if month else "")
