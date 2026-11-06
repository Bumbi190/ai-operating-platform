"""Interactive UI audit: the composer stays minimal, actions live in ⋯."""
import os
import sys
import tkinter as tk

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from nova_overlay import NovaOverlay

a = NovaOverlay()
a.expand()
a._choices([("Öppna Atlas", lambda: None), ("Kopiera igen", lambda: None),
            ("Avbryt", lambda: None)])


def descendants(widget):
    for child in widget.winfo_children():
        yield child
        yield from descendants(child)


def check():
    try:
        a.root.update_idletasks()
        limit = a.root.winfo_rooty() + a.root.winfo_height()
        for label, widget in (("Chat", a.chat), ("Input", a.command),
                              ("More", a.more_button)):
            y = widget.winfo_rooty()
            h = widget.winfo_height()
            assert y >= a.root.winfo_rooty(), (label, y)
            assert y + h <= limit, (label, y + h, limit)
            print(label, "BOTTOM", y + h, "LIMIT", limit, flush=True)

        button_labels = [w.cget("text") for w in descendants(a.root)
                         if isinstance(w, tk.Button)]
        assert "🎙 Prata" in button_labels, button_labels
        assert "➤ Skicka" in button_labels, button_labels
        assert "⋯" in button_labels, button_labels
        for label in ("Projekt", "Fönster", "Stopp", "Anslut Atlas"):
            assert label not in button_labels, (label, button_labels)

        menu = a._make_more_menu()
        menu_labels = [menu.entrycget(i, "label")
                       for i in range(menu.index("end") + 1)
                       if menu.type(i) == "command"]
        for label in ("Öppna Atlas", "Kopiera igen", "Avbryt",
                      "Projektmappar", "Öppna fönster", "Anslut Atlas",
                      "Flytta Nova nära muspekaren",
                      "Stoppa pågående uppdrag (Ctrl+.)"):
            assert label in menu_labels, (label, menu_labels)
        menu.destroy()

        class Event:
            state = 0

        called = []
        a.send = lambda: called.append(True)
        assert a._submit_enter(Event()) == "break"
        assert called == [True]
        Event.state = 0x0001
        assert a._submit_enter(Event()) is None
        assert called == [True]

        print("MINIMAL_COMPOSER_AND_HIDDEN_ACTIONS_PASS", flush=True)
    finally:
        a.quit()


a.root.after(350, check)
a.root.after(3500, lambda: a.quit() if not a.closed else None)
a.root.mainloop()
