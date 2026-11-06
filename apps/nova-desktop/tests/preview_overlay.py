"""Ephemeral visual QA capture of only Nova's central panel (no other app)."""
import os
import sys
from PIL import ImageGrab
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from nova_overlay import NovaOverlay

app = NovaOverlay()
app.expand(False)
app._append("you", "DU: Öppna projektmappen för Handlarbörsen")
app._append("step", "  ↳ Filutforskaren: Handlarborsen")
app._append("ok", "Nova: Windows fick instruktion att visa projektmappen.")
app._append("nova", "Nova: För att läsa senaste mejlet behöver jag Atlas.")
app._append("warn", "Inga mejl har skickats eller ändrats.")
app._choices([("Öppna Atlas", lambda: None), ("Avbryt", lambda: None)])
app._phase("godkannande", "Väntar på ditt nästa steg")


def capture():
    app.root.update_idletasks()
    x, y = app.root.winfo_rootx(), app.root.winfo_rooty()
    output = os.path.join(os.path.dirname(__file__), "nova-overlay-preview.jpg")
    # Sample strictly from inside the opaque Nova surface, never the desktop around it.
    ImageGrab.grab(bbox=(x+20, y+20, x+421, y+577)).convert("RGB").save(output, quality=84)
    print("PREVIEW", output, os.stat(output).st_size, flush=True)
    app.quit()


app.root.after(850, capture)
app.root.after(4000, lambda: app.quit() if not app.closed else None)
app.root.mainloop()
