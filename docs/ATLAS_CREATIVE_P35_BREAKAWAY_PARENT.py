# THROWAWAY: only fixed system curl --version; never a URL or a shell.
import ctypes as c
from ctypes import wintypes as w
import sys, time
assert c.sizeof(c.c_void_p) == 8
k = c.WinDLL(r'C:\Windows\System32\kernel32.dll', use_last_error=True)
class SI(c.Structure):
    _fields_ = [('cb',w.DWORD),('reserved',w.LPWSTR),('desktop',w.LPWSTR),('title',w.LPWSTR),
        ('x',w.DWORD),('y',w.DWORD),('xc',w.DWORD),('yc',w.DWORD),('xchars',w.DWORD),('ychars',w.DWORD),('fill',w.DWORD),('flags',w.DWORD),
        ('show',w.WORD),('extraSize',w.WORD),('extra',c.c_void_p),('stdin',w.HANDLE),('stdout',w.HANDLE),('stderr',w.HANDLE)]
class PI(c.Structure):
    _fields_ = [('process',w.HANDLE),('thread',w.HANDLE),('pid',w.DWORD),('tid',w.DWORD)]
assert c.sizeof(SI)==104 and c.sizeof(PI)==24
k.CreateProcessW.argtypes = [w.LPCWSTR,w.LPWSTR,c.c_void_p,c.c_void_p,w.BOOL,w.DWORD,c.c_void_p,w.LPCWSTR,c.POINTER(SI),c.POINTER(PI)]
k.CreateProcessW.restype = w.BOOL
k.WaitForSingleObject.argtypes=[w.HANDLE,w.DWORD]; k.WaitForSingleObject.restype=w.DWORD
k.GetExitCodeProcess.argtypes=[w.HANDLE,c.POINTER(w.DWORD)]; k.GetExitCodeProcess.restype=w.BOOL
k.TerminateProcess.argtypes=[w.HANDLE,w.UINT]; k.TerminateProcess.restype=w.BOOL
k.CloseHandle.argtypes=[w.HANDLE]; k.CloseHandle.restype=w.BOOL
k.GetCurrentProcessId.argtypes=[]; k.GetCurrentProcessId.restype=w.DWORD
k.MoveFileW.argtypes=[w.LPCWSTR,w.LPCWSTR]; k.MoveFileW.restype=w.BOOL
base,nonce=sys.argv[1:]
def put(suffix,text):
    path=base+suffix
    with open(path+'.tmp','x',encoding='ascii') as f: f.write(text)
    if not k.MoveFileW(path+'.tmp',path): raise c.WinError(c.get_last_error())
def run(flags):
    si=SI(); si.cb=c.sizeof(si); pi=PI()
    command=c.create_unicode_buffer(r'"C:\Windows\System32\curl.exe" -q --version')
    made=k.CreateProcessW(r'C:\Windows\System32\curl.exe',command,None,None,False,flags,None,r'C:\Windows\System32',c.byref(si),c.byref(pi))
    error=0 if made else c.get_last_error()
    if not made: return [0,error,-1,1]
    stopped=False
    try:
        state=k.WaitForSingleObject(pi.process,5000)
        if state==0:
            code=w.DWORD()
            if not k.GetExitCodeProcess(pi.process,c.byref(code)): raise c.WinError(c.get_last_error())
            stopped=True
            return [1,0,code.value,1]
        if not k.TerminateProcess(pi.process,72): raise c.WinError(c.get_last_error())
        stopped=k.WaitForSingleObject(pi.process,5000)==0
        return [1,0,-2,int(stopped)]
    finally:
        if not stopped:
            k.TerminateProcess(pi.process,73)
            k.WaitForSingleObject(pi.process,5000)
        k.CloseHandle(pi.thread); k.CloseHandle(pi.process)
identity=nonce+'|'+str(k.GetCurrentProcessId())+'|'+sys.version.split()[0]
put('.started',identity)
before=run(0x08000000)
# Do not attempt breakaway unless this exact image/command worked first.
if before != [1,0,0,1]:
    put('.error',identity+'|normal-before='+str(before))
    sys.exit(71)
attempt=run(0x09000000) # CREATE_NO_WINDOW | CREATE_BREAKAWAY_FROM_JOB
after=run(0x08000000)
put('.report',identity+'|'+ '|'.join(str(v) for row in [before,attempt,after] for v in row))
time.sleep(30)
