import ctypes
from ctypes import wintypes
from nova_overlay import work_area, anchored_geometry
u = ctypes.windll.user32
hwnd=u.GetForegroundWindow()
rect=wintypes.RECT()
u.GetWindowRect(hwnd,ctypes.byref(rect))
p=wintypes.POINT()
u.GetCursorPos(ctypes.byref(p))
print("WORK_AREA",work_area())
print("FOREGROUND_RECT",(rect.left,rect.top,rect.right,rect.bottom))
print("CURSOR",(p.x,p.y))
print("BUBBLE_CURRENT",anchored_geometry(94,94))
print("PANEL_CURRENT",anchored_geometry(442,600))
