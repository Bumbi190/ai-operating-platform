"""One local Windows operator request and its Desktop Commander MCP session."""
import json
import os
from pathlib import Path
import queue
import re
import subprocess
import threading

from nova_core import normalized
from nova_voice_intent import LOCAL_MODEL

_EXPLICIT = re.compile(r"^(?:(?:kan|vill|skulle) du (?:kunna )?)?(?:använd(?:a)? |kör (?:med |via )?|be )?(?:desktop[ -]?commander|datoruppdrag)\b[ ,:–-]*(?:att )?", re.I)
_ACTION = re.compile(r"^(?:(?:kan|vill|skulle) du (?:kunna )?)?(?:lista|visa|kolla|hitta|leta|sok|las|sammanfatta|oppna|skapa|flytta|kopiera|byt namn|dop om|spara|redigera|andra|sortera|organisera|kor|stoppa|stang|avsluta|radera|ta bort|skriv)\b")
_SUBJECT = re.compile(r"\b(?:\w*fil(?:en|er|erna)?|mapp\w*|katalog\w*|skrivbord\w*|dokument\w*|nedladdning\w*|process\w*|powershell|terminal\w*|kommando\w*|program\w*|dator\w*)\b|[a-z]:[\\/]")
_NEGATIVE = re.compile(r"\b(?:inte|aldrig|lat bli)\b")


def commander_request(text, *, explicit_only=False):
    goal = re.sub(r"^(?:(?:hej|okej)[, ]+)?nova\b[ ,:!?.-]*", "", text.strip(), flags=re.I)
    explicit = _EXPLICIT.match(goal)
    if explicit:
        return goal[explicit.end():].strip() or None
    if explicit_only:
        return None
    words = normalized(goal)
    file_question = re.match(r"^(?:vad (?:star|finns|ligger)|vilka (?:filer|mappar)|var (?:finns|ligger)|hur stor ar)\b", words)
    if ((_ACTION.search(words) or file_question) and _SUBJECT.search(words) and not _NEGATIVE.search(words)):
        return goal or None
    return None


def known_folders():
    import winreg
    user = Path.home()
    locations = {"home": str(user), "desktop": str(user / "Desktop"),
                 "documents": str(user / "Documents"), "downloads": str(user / "Downloads")}
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders") as key:
        for label, name in (("desktop", "Desktop"), ("documents", "Personal"),
                            ("downloads", "{374DE290-123F-4565-9164-39C4925E467B}")):
            try:
                locations[label] = os.path.expandvars(winreg.QueryValueEx(key, name)[0])
            except OSError:
                pass
    return locations


class CommanderSession:
    def __init__(self, goal):
        config = Path(os.environ["LOCALAPPDATA"]) / "Omnira" / "Nova" / "desktop-commander.json"
        try:
            settings = json.loads(config.read_text(encoding="utf-8-sig"))
            node, entry = Path(settings["node"]), Path(settings["entry"])
            if not (node.is_absolute() and node.is_file() and entry.is_absolute() and entry.is_file()):
                raise ValueError()
            folders = known_folders()
        except (OSError, KeyError, TypeError, ValueError) as exc:
            raise ValueError("Nova hittar inte den lokala Desktop Commander-installationen.") from exc
        self.events = queue.SimpleQueue()
        self.process = subprocess.Popen([str(node), str(Path(__file__).with_name("nova_commander.cjs")), str(entry)],
                                       stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                       encoding="utf-8", creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        threading.Thread(target=self._read, daemon=True).start()
        try:
            self._send({"goal": goal, "model": LOCAL_MODEL, "folders": folders})
        except OSError:
            self.close()
            raise

    def _send(self, value):
        self.process.stdin.write(json.dumps(value, ensure_ascii=True) + "\n")
        self.process.stdin.flush()

    def approve(self, token):
        self._send({"approve": token})

    def _read(self):
        try:
            with self.process.stdout as stream:
                for line in stream:
                    self.events.put(json.loads(line))
        except (OSError, UnicodeError, ValueError):
            self.events.put({"kind": "error", "text": "Desktop Commanders svar kunde inte läsas."})
        finally:
            self.events.put({"kind": "closed", "code": self.process.wait()})

    def close(self):
        try:
            self.process.stdin.close()
        except OSError:
            pass
