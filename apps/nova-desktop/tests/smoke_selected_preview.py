"""Inspect only saved origin selection; never print pairing keys or launch browser."""
import os
import sys
from pathlib import Path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from nova_bridge import read_saved_preview_origin
from nova_overlay import NovaOverlay

saved = Path(os.environ["LOCALAPPDATA"]) / "Omnira" / "Nova" / "preview-origin.txt"
approved = read_saved_preview_origin(str(saved))
assert approved is not None, "No allowlisted preview origin selected"
app = NovaOverlay()
try:
    selected = next(iter(app.bridge.state.origins))
    assert selected == approved, (selected, approved)
    assert app.bridge.pairing_url().startswith(approved + "/nova-bridge#")
    assert not app.bridge.state.online()
    print("PREVIEW_HOST_CONFIGURED_NO_CREDENTIALS_OR_LOGIN", selected, flush=True)
finally:
    app.quit()
