"""UI routing proof for Facebook speech transcript; browser is mocked."""
import os
import sys
from unittest.mock import patch
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from nova_overlay import NovaOverlay

app = NovaOverlay()
app.expand(False)
urls = []


def check():
    try:
        with patch("nova_overlay.webbrowser.open",
                   side_effect=lambda url, new=0: (urls.append(url), True)[1]):
            app.command.insert("1.0", "Är Nova kan du navigera mig till Facebook")
            app.send()
            assert urls == ["https://www.facebook.com/"], urls
            assert any("Öppningen skickad till webbläsaren" in t
                       for k, t in app.history)
            assert not any("Klistra in med Ctrl+V" in t
                           for k, t in app.history)
        print("FACEBOOK_NAVIGATION_UI_ROUTE_PASS", flush=True)
    finally:
        app.quit()


app.root.after(350, check)
app.root.after(3000, lambda: app.quit() if not app.closed else None)
app.root.mainloop()
