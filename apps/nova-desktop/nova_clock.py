"""Read the current wall clock in the requested city, including daylight saving time."""
from datetime import datetime, timezone
from functools import lru_cache
import os
from pathlib import Path
import re
import subprocess
from zoneinfo import TZPATH, ZoneInfo, ZoneInfoNotFoundError, reset_tzpath

from nova_core import normalized

# Windows installations without the IANA database have equivalent system zones.
CITIES = {
    "new york": ("New York", "America/New_York", "Eastern Standard Time"),
    "miami": ("Miami", "America/New_York", "Eastern Standard Time"),
    "chicago": ("Chicago", "America/Chicago", "Central Standard Time"),
    "dallas": ("Dallas", "America/Chicago", "Central Standard Time"),
    "denver": ("Denver", "America/Denver", "Mountain Standard Time"),
    "phoenix": ("Phoenix", "America/Phoenix", "US Mountain Standard Time"),
    "los angeles": ("Los Angeles", "America/Los_Angeles", "Pacific Standard Time"),
    "san francisco": ("San Francisco", "America/Los_Angeles", "Pacific Standard Time"),
    "stockholm": ("Stockholm", "Europe/Stockholm", "W. Europe Standard Time"),
    "sverige": ("Sverige", "Europe/Stockholm", "W. Europe Standard Time"),
    "london": ("London", "Europe/London", "GMT Standard Time"),
    "tokyo": ("Tokyo", "Asia/Tokyo", "Tokyo Standard Time"),
    "toronto": ("Toronto", "America/Toronto", "Eastern Standard Time"),
    "mexico city": ("Mexico City", "America/Mexico_City", "Central Standard Time (Mexico)"),
    "buenos aires": ("Buenos Aires", "America/Argentina/Buenos_Aires", "Argentina Standard Time"),
}
CLOCK = re.compile(r"(?:(?:hej nova|nova|okej)[, ]+)?(?:(?:kan du (?:saga|kolla)|vet du) )?"
                   r"(?:vad (?:ar klockan|klockan ar)|hur mycket (?:ar klockan|klockan ar))"
                   r"(?: (?:just nu|nu|idag|i dag))?(?: (?:i|pa) (.+?))?"
                   r"(?: (?:just nu|nu|idag|i dag))?")
CLARIFY = "Vilken stad menar du? Till exempel New York eller Los Angeles."
_LOCAL = {"har", "har hemma"}
_WINDOWS_CLOCK = ("$ErrorActionPreference='Stop';$line=[Console]::ReadLine().Split('|');"
                  "$at=[DateTimeOffset]::FromUnixTimeSeconds([long]$line[0]);"
                  "[TimeZoneInfo]::ConvertTimeBySystemTimeZoneId($at,$line[1]).ToString('HH:mm')")


@lru_cache(maxsize=1)
def places():
    catalog = dict(CITIES)
    local_db = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "Omnira/Nova/timezones/tzdata/zoneinfo"
    paths = [Path(path) for path in TZPATH]
    if (local_db / "zone.tab").is_file():
        paths.append(local_db)
        reset_tzpath(paths)
    for directory in paths:
        table = directory / "zone.tab"
        if not table.is_file():
            continue
        for line in table.read_text(encoding="utf-8").splitlines():
            if not line or line.startswith("#"):
                continue
            zone = line.split("\t")[2]
            name = zone.rsplit("/", 1)[-1].replace("_", " ")
            catalog.setdefault(normalized(name), (name, zone, None))
            catalog[normalized(zone)] = (name, zone, None)
        break
    return catalog


def time_in(city, now):
    _, iana, windows = places()[city]
    try:
        return now.astimezone(ZoneInfo(iana)).strftime("%H:%M")
    except ZoneInfoNotFoundError:
        if os.name != "nt" or not windows:
            raise
    shell = Path(os.environ["SystemRoot"]) / "System32/WindowsPowerShell/v1.0/powershell.exe"
    result = subprocess.run([str(shell), "-NoProfile", "-NonInteractive", "-Command", _WINDOWS_CLOCK],
                            input=f"{int(now.timestamp())}|{windows}\n", capture_output=True, text=True,
                            timeout=6, check=True, creationflags=subprocess.CREATE_NO_WINDOW)
    value = result.stdout.strip()
    if not re.fullmatch(r"[0-2]\d:[0-5]\d", value):
        raise ValueError("Unexpected clock result")
    return value


def clock_answer(turns, *, now=None):
    if not turns or turns[-1][0] != "user":
        return None
    words = normalized(turns[-1][1]).strip(" .?!")
    match = CLOCK.fullmatch(words)
    if match:
        place = (match[1] or "").strip()
    elif len(turns) >= 2 and turns[-2][0] == "assistant" and (
            turns[-2][1] == CLARIFY or re.fullmatch(r"Klockan är \d\d:\d\d(?: i [^.!?]+)?\.", turns[-2][1])):
        place = re.sub(r"^(?:jag menar |och |vad ar den |hur ar det )?(?:i )?", "", words)
        place = re.sub(r"(?: da| tack)$", "", place)
        if place not in places():
            return None
    else:
        return None
    now = now or datetime.now(timezone.utc)
    if not place or place in _LOCAL:
        return "Klockan är " + now.astimezone().strftime("%H:%M") + "."
    if place not in places():
        return CLARIFY
    try:
        return f"Klockan är {time_in(place, now)} i {places()[place][0]}."
    except (OSError, KeyError, ValueError, subprocess.SubprocessError):
        return "Jag kunde inte läsa den tidszonen från datorn just nu."
