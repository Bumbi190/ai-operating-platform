"""Inspect visibility of the expanded panel and options, no screenshot."""
import os,sys
sys.path.insert(0,os.path.abspath(os.path.join(os.path.dirname(__file__),"..")))
from nova_overlay import NovaOverlay
a=NovaOverlay()
a.expand()
a._choices([("Open Atlas",lambda:None),("Kopiera",lambda:None),("Avbryt",lambda:None)])
def check():
    a.root.update_idletasks()
    limit=a.root.winfo_rooty()+a.root.winfo_height()
    for label,w in (("Chat",a.chat),("Input",a.command),("Choices",a.choices),
                    ("ChoiceBtn",a.choices.winfo_children()[0])):
        y=w.winfo_rooty(); h=w.winfo_height()
        print(label,"Y",y,"H",h,"BOTTOM",y+h,"LIMIT",limit,"VISIBLE",y+h<limit,flush=True)
    a.quit()
a.root.after(500,check)
a.root.after(3500,lambda:a.quit() if not a.closed else None)
a.root.mainloop()
