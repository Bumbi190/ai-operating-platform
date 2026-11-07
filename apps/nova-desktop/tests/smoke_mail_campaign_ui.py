"""Operator GUI smoke: mail/calendar open, campaign preview is GET only.

No actual browser tabs, emails, calendar writes, agents or external API calls.
"""
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from nova_overlay import NovaOverlay
from nova_core import URLS

os.environ["NOVA_NO_PLACEMENT_SAVE"] = "1"
ui = NovaOverlay()
ui.expand(False)
urls = []
opened = patch('nova_overlay.webbrowser.open',
               side_effect=lambda url, new=0: (urls.append(url), True)[1])
opened.start()
temp = tempfile.TemporaryDirectory()
ui.campaign_preview_file = Path(temp.name) / 'approved-preview.txt'
preview = 'https://ai-operating-platform-2j15fviuv-bumbi190s-projects.vercel.app'


def issue(text: str):
    ui.command.delete('1.0', 'end')
    ui.command.insert('1.0', text)
    ui.send()


def test():
    try:
        issue('Nova öppna Strato')
        assert urls.pop() == URLS['strato']
        issue('Nova öppna Gmail')
        assert urls.pop() == URLS['gmail']
        issue('Nova öppna kalendern i Omnira')
        assert urls.pop() == URLS['planning']
        assert any('inte verifierad' in msg for _, msg in ui.history)
        print('MAIL_AND_OMNIRA_PLANNING_UI_PASS', flush=True)

        issue('Nova planera content till Familje-Stunden i december')
        assert urls.pop() == URLS['marketing']
        assert any('Inga agenter har beställts' in msg for _, msg in ui.history)
        print('NO_PREVIEW_FAILS_TO_EXISTING_MARKETING_WITHOUT_AGENT_RUN_PASS', flush=True)

        ui.campaign_preview_file.write_text(preview + '\n', encoding='utf-8')
        issue('Nova planera content för Familje-Stunden i december')
        assert urls.pop() == preview + '/nova-actions/marketing?month=2026-12'
        assert any('tryckt Godkänn' in msg for _, msg in ui.history)
        print('PREVIEW_CAMPAIGN_OPENS_ONLY_REVIEW_URL_PASS', flush=True)
    finally:
        opened.stop()
        temp.cleanup()
        ui.quit()


ui.root.after(410, test)
ui.root.after(3500, lambda: ui.quit() if not ui.closed else None)
ui.root.mainloop()
