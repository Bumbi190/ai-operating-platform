"""Desktop-local screen and mailbox turns. UI state belongs to the Tk thread."""
import imaplib
import json
import os
from pathlib import Path
import subprocess
import webbrowser
import queue
import re
import smtplib
import threading
import time
from tkinter import simpledialog

import nova_mail as mail
import nova_destinations as destinations
from nova_commander import known_folders, selected_project
from nova_news import headlines
from nova_uia import browser_target
from nova_local_audio import VENV_PYTHON
from nova_auto_voice import native_command_text
from nova_core import normalized
from nova_uia import read_active_window, read_desktop_window, UIAutomationError

SCREEN = re.compile(mail.PREFIX + r"(?:vad (?:ser du|står det|visas) (?:på (?:min |den här )?skärm(?:en)?|i (?:(?:det här |det aktiva )?fönstret|mitt fönster))|(?:kan du )?se vad jag har på skärmen|ser du (?:vad jag har på |min )skärm(?:en)?(?: just nu)?|(?:läs|visa)(?: upp)? (?:det som (?:står|syns) på skärmen|(?:den här |min )?skärm(?:en)?|(?:det här |det aktiva )?fönstret))[?.! ]*$", re.I)


# Swedish dictation often spells out GPT and joins it to "sidan".
_CHAT_PAGE = r"(?:chatt?[- ]?(?:gpt|g[ie]p[aei]t(?:e|i)?n?|gepete|g p t)(?:[- ]?(?:sidan|sida|chatten))?)"
_PAGE = re.compile(
    r"^(?:nova[, ]+)?(?:kan du (?:se|lasa)|ser du|vad (?:ser du|star det) pa|las)"
    r" (?:(?:den har|den|min) )?(?P<target>" + _CHAT_PAGE + r"|sidan|webbsidan|fliken|chatten)"
    r"(?: (?:som )?jag (?:har (?:oppnat|oppen|oppet|framme)|oppnade)| som ar oppen)?"
    r"(?: (?:har|just nu))?[.?! ]*$"
)


class Workspace:
    def __init__(self, panel):
        self.panel = panel
        self.provider = None
        self.source = None
        self.draft = None
        self.sending = None
        self.follow_until = 0
        self.epoch = 0
        self.results = queue.SimpleQueue()
        self.pending_destination = None
        self.last_url = None

    def reset(self, provider=None):
        self.pending_destination = self.last_url = None
        self.follow_until = 0
        self.epoch += 1
        self.provider = provider
        self.source = self.draft = None

    def configure(self, provider):
        if self.sending:
            self.panel._append("warn", "Invänta pågående sändning.")
            return
        tip = "Använd Googles applösenord." if provider == "Gmail" else "Använd lösenordet för din STRATO-brevlåda."
        address = simpledialog.askstring("Nova · " + provider, "Mejladress", parent=self.panel.root)
        if not address:
            return
        secret = simpledialog.askstring("Nova · " + provider, tip + " Sparas krypterat för ditt Windows-konto.", show="•", parent=self.panel.root)
        if secret:
            try:
                mail.save_account(provider, address.strip(), secret)
                self.reset(provider)
                self.panel._choices([])
                self.panel._append("nova", "Kontouppgifterna är sparade. Be mig läsa det senaste mejlet för att testa inloggningen.")
            except (ValueError, OSError):
                self.panel._append("warn", "Kontouppgifterna kunde inte sparas. Kontrollera adressen.")

    def job(self, kind, work):
        token = self.epoch

        def run():
            try:
                value = work()
                error = ""
            except (imaplib.IMAP4.error, smtplib.SMTPAuthenticationError):
                value, error = None, "Mejlinloggningen eller inkorgsåtgärden nekades. Kontrollera kontouppgifterna i Novas meny."
            except mail.DeliveryUncertain as exc:
                value, error = "uncertain", str(exc)
            except mail.MailError as exc:
                value, error = None, str(exc)
            except UIAutomationError as exc:
                if str(exc) == "login_needed":
                    self.results.put((token, kind, None, "Webbläsaren visar inloggningen. Logga in i fliken och be mig fortsätta till sidan."))
                    return
                if kind in ("visit", "analyze", "link"):
                    self.results.put((token, kind, None, {
                        "visit": "Jag skickade adressen till webbläsaren men kunde inte bekräfta rätt sida i den aktiva fliken.",
                        "analyze": "Jag kunde inte läsa den avsedda sidan. Ta fram fliken och be mig analysera den igen.",
                        "link": "Jag kunde inte hitta en entydig synlig länk med det namnet på sidan.",
                    }[kind]))
                    return
                value = None
                error = ("Ta fram ChatGPT-fliken och be mig läsa den igen."
                         if str(exc) == "expected_page_not_active"
                         else "Jag kunde inte läsa synlig text i det aktiva fönstret. Ha fönstret framme och be mig läsa det igen.")
            except Exception:
                value, error = None, "Åtgärden kunde inte slutföras. Kontrollera anslutningen och försök igen."
            self.results.put((token, kind, value, error))

        threading.Thread(target=run, daemon=True).start()

    def poll(self):
        while not self.results.empty():
            token, kind, value, error = self.results.get_nowait()
            if kind == "send":
                previous, self.sending = self.sending, None
                if error and value != "uncertain" and token == self.epoch and self.panel.expanded and previous:
                    self.source, self.draft = previous.source, previous
                    self.show_draft(previous)
                self.panel._reply("warn" if error else "ok", error or "Mejlservern har tagit emot ditt svar.")
                continue
            if token != self.epoch or not self.panel.expanded:
                continue
            if kind in ("app_lookup", "visit", "link", "news", "volume", "analyze", "analysis_reply"):
                self.finish_desktop(kind, value, error)
                continue
            if error and kind in ("screen", "page"):
                self.panel._reply("warn", error, spoken="Jag kunde inte läsa fönstret. Ha sidan framme och försök igen.")
            elif error:
                self.panel._reply("warn", error)
            elif kind in ("screen", "page"):
                description = "Synlig text i " + value["processName"] + "\n\n" + value["text"]
                call = getattr(self.panel, "live_call", None)
                if call:
                    self.panel._append("nova", description)
                    call.observe(description)
                    self.panel.voice_interpreter.submit_live(call.question, call.snapshot(), reading=True)
                else:
                    self.panel._reply("nova", description, spoken="Jag har läst texten i fönstret. Du ser den i chatten.")
            else:
                self.follow_until = time.monotonic() + 25
                self.source = value
                body = value.body or "(Mejlet saknar läsbar text.)"
                self.panel._append("nova", f"{value.provider} · {value.account}\nFrån: {value.sender}\nÄmne: {value.subject}\n\n" + body[:24000] + ("\n… (förkortat)" if len(body) > 24000 else ""))
                call = getattr(self.panel, "live_call", None)
                if call:
                    call.observe("Från " + value.sender + ", ämne " + value.subject + "\n" + body)
                if kind == "aloud":
                    self.panel._read_aloud(body[:24000])
                elif call:
                    self.panel.voice_interpreter.submit_live(call.question, call.snapshot(), reading=True)
                else:
                    self.panel._reply("nova", "Mejlet visas här. Du kan diktera ett svar.")
            if error or kind != "aloud":
                self.panel._phase("godkannande" if error else "klar", error or "Klart")

    def route(self, text):
        command, _ = native_command_text(text)
        page = _PAGE.fullmatch(normalized(command))
        if page:
            return "page", "chatgpt" if re.fullmatch(_CHAT_PAGE, page["target"]) else None
        if SCREEN.fullmatch(command.strip()):
            return "screen", None
        return (mail.intent(text, active=self.source is not None or self.sending is not None)
                or destinations.request(command.removeprefix("Nova, "), pending=self.pending_destination,
                                        last_url=self.last_url, spotify=getattr(self.panel, "spotify_selected", False)))

    def handle(self, request, text):
        action, value = request
        ui = self.panel
        self.pending_destination = None
        if action in ("website", "website_analyze", "website_link", "link", "ask_target", "confirm_url",
                      "app_lookup", "volume", "which_volume", "news", "news_topic", "analyze",
                      "known_folder", "local_item", "project_folder"):
            self.handle_desktop(action, value, text)
            return
        if action in ("screen", "page"):
            self.epoch += 1
            self.job(action, read_desktop_window if action == "screen" else
                     lambda: read_active_window(user_requested=True, expected_site=value))
            ui._phase("tolkar", "Läser det aktiva fönstret")
            return
        if self.sending:
            ui._reply("nova", "Mejlet håller på att skickas. Invänta serverns besked.")
            return
        if action == "setup":
            self.configure(value)
        elif action in ("latest", "subject", "latest_subject", "visible_mail", "choose"):
            provider, subject = value if action in ("subject", "latest_subject") else (value, None)
            provider = provider or self.provider
            self.reset(provider)
            if not provider or action == "choose":
                ui._reply("nova", "Vilket mejl? Ange exempelvis ”läs senaste mejlet i Gmail” eller ”läs mejlet om offert i Strato”.")
            elif not mail.credentials_path(provider).is_file():
                ui._append("nova", f"Anslut {provider} en gång för att läsa och besvara mejl här.")
                ui._choices([("Anslut " + provider, lambda: self.configure(provider)), ("Avbryt", lambda: ui._choices([]))])
            else:
                def read():
                    visible = read_active_window(user_requested=True)["text"] if action == "visible_mail" else None
                    return mail.read_inbox(provider, subject, latest_match=action == "latest_subject", visible=visible)

                self.job("aloud" if re.search(r"\bläs(?:a)? upp\b", text, re.I) else "read",
                         read)
                ui._phase("tolkar", "Läser inkorgen i " + provider)
        elif action == "discard":
            self.draft = None
            ui._choices([])
            ui._reply("nova", "Utkastet har kastats.")
        elif action == "send":
            self.send_reviewed(self.draft)
        elif action in ("draft", "append", "remove"):
            if not self.source or not self.source.recipient:
                ui._reply("warn", "Mejlet behöver ha en entydig svarsadress.")
                return
            if not self.draft and action != "draft":
                ui._reply("nova", "Säg först vad du vill svara.")
                return
            try:
                draft = (self.draft or mail.Draft(self.source, "")).edit(action, value)
            except mail.MailError as exc:
                ui._reply("warn", str(exc))
                return
            self.follow_until = time.monotonic() + 25
            self.draft = draft
            self.show_draft(draft)

    def handle_desktop(self, action, value, text):
        ui = self.panel
        self.epoch += 1
        if action in ("ask_target", "confirm_url", "news_topic"):
            self.pending_destination = (action, value)
            question = {"ask_target": "Vilken app eller webbadress vill du öppna?",
                        "confirm_url": "Menar du din portfolio på andrehultgren.se?",
                        "news_topic": "Vilket ämne vill du höra nyheter om?"}
            ui._reply("nova", question[action])
            return
        if action in ("website", "website_analyze", "website_link"):
            url, label = value if action == "website_link" else (value, None)
            if not destinations.web_url(url):
                ui._reply("warn", "Jag kunde inte tolka webbadressen.")
                return
            ui.spotify_selected = False
            self.last_url = url
            try:
                if not webbrowser.open(url, new=2):
                    raise OSError()
            except OSError:
                ui._reply("warn", "Webbläsaren tog inte emot adressen.")
                return
            ui._phase("navigerar", "Kontrollerar adressen i webbläsaren")
            epoch = self.epoch
            def verify():
                for attempt in range(3):
                    if epoch != self.epoch:
                        raise UIAutomationError("cancelled")
                    try:
                        browser_target("verify_url", url=url)
                        return url, action, label, text
                    except UIAutomationError as exc:
                        if attempt == 2 or str(exc) == "login_needed":
                            raise
                        time.sleep(.3)
            self.job("visit", verify)
        elif action == "analyze":
            ui._phase("tolkar", "Läser den synliga sidan")
            self.job("analyze", lambda: (text, browser_target("read_window", url=value)))
        elif action == "link":
            expected = self.last_url
            ui._phase("tolkar", "Letar efter länken på sidan")
            self.job("link", lambda: browser_target("find_page_link", url=expected, label=value)["url"])
        elif action in ("known_folder", "local_item", "project_folder"):
            try:
                if action == "project_folder":
                    value = selected_project('projektet "' + value + '"')
                elif action == "known_folder":
                    value = known_folders()[value]
                item = Path(value)
                if item.is_dir():
                    os.startfile(str(item))
                    ui._reply("ok", "Jag har bett Utforskaren öppna mappen " + item.name + ".")
                elif item.is_file():
                    # Select the file even if its default open verb would run a script or installer.
                    subprocess.Popen([str(Path(os.environ["SystemRoot"]) / "explorer.exe"), "/select,", str(item)])
                    ui._reply("ok", "Jag har bett Utforskaren visa filen " + item.name + ".")
                else:
                    ui._reply("warn", "Jag hittar inte den sökvägen på datorn.")
            except (OSError, ValueError, TypeError):
                ui._reply("warn", "Windows kunde inte öppna den mappen eller filen.")
        elif action == "app_lookup":
            ui._phase("tolkar", "Söker i Windows Start-meny")
            self.job("app_lookup", lambda: (value, destinations.match_entries(value, destinations.start_entries())))
        elif action == "news":
            ui._phase("tolkar", "Hämtar daterade nyhetsrubriker")
            self.job("news", lambda: headlines(value))
        elif action == "which_volume":
            self.pending_destination = (action, value)
            ui._reply("nova", "Menar du volymen i Spotify?")
        else:
            def volume():
                script = Path(__file__).with_name("nova_volume.py")
                run = subprocess.run([str(VENV_PYTHON), str(script), value], capture_output=True,
                                     timeout=8, check=True, creationflags=subprocess.CREATE_NO_WINDOW)
                return json.loads(run.stdout)
            self.job("volume", volume)

    def finish_desktop(self, kind, value, error):
        ui = self.panel
        if error:
            ui._reply("warn", error)
        elif kind == "visit":
            url, action, label, instruction = value
            if action == "website_analyze":
                self.handle_desktop("analyze", url, instruction)
            elif action == "website_link":
                self.handle_desktop("link", label, instruction)
            else:
                ui._reply("ok", "Webbläsaren visar " + url.removeprefix("https://").rstrip("/") + ".")
        elif kind == "link":
            self.handle_desktop("website", value, "")
        elif kind == "analyze":
            from nova_live import LiveCall, respond
            instruction, page = value
            call = getattr(ui, "live_call", None)
            if call is None:
                call = LiveCall("", time.monotonic())
                call.hear(instruction)
            evidence = "Synlig sidtext:\n" + page["text"]
            call.observe(evidence)
            ui._append("step", evidence[:1200])
            snapshot = call.snapshot()
            self.job("analysis_reply", lambda: respond(snapshot, reading=True).message)
        elif kind == "app_lookup":
            name, found = value
            if len(found) == 1:
                app = found[0]
                try:
                    os.startfile("shell:AppsFolder\\" + app["AppID"])
                    self.last_url = None
                    ui.spotify_selected = False
                    ui._reply("ok", "Windows har fått begäran att öppna " + app["Name"] + ".")
                except OSError:
                    ui._reply("warn", "Windows kunde inte öppna " + app["Name"] + ".")
            elif found:
                self.pending_destination = ("ask_target", None)
                ui._reply("nova", "Vilket program menar du? " + ", ".join(a["Name"] for a in found[:4]) + ".")
            else:
                self.pending_destination = ("ask_target", None)
                ui._reply("nova", f"Jag hittar inget program med namnet {name} i Start-menyn. Vilket namn eller vilken webbadress vill du använda?")
        else:
            ui._reply("nova", value)

    def show_draft(self, draft):
        self.panel._append("nova", "Granska ditt svar\n" + draft.preview())
        self.panel._choices([("Skicka svaret", lambda: self.send_reviewed(draft)), ("Kasta utkast", lambda: self.discard(draft))])
        if getattr(self.panel, "live_call", None):
            self.panel._reply("nova", "Här är förslaget. " + draft.text)
        self.panel._phase("godkannande", "Granska mottagaren och svaret")

    def discard(self, draft):
        if draft is self.draft:
            self.handle(("discard", None), "")

    def send_reviewed(self, draft):
        if not draft or draft is not self.draft or self.sending or not self.panel.expanded:
            self.panel._append("warn", "Det finns inget aktuellt granskat svar att skicka.")
            return
        self.sending, self.draft = draft, None
        self.source = None
        self.panel._choices([])
        self.panel._phase("navigerar", "Skickar det granskade svaret")
        self.job("send", lambda: mail.deliver(draft))
