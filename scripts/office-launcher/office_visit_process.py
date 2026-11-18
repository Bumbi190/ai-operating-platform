"""Pinned Windows kernel process identity; no PID-only liveness or window titles."""
from __future__ import annotations
import ntpath
import sys
import time
from office_launcher import OfficeUnavailable, matching_office


class WindowsProcessLease:
    def __init__(self, handle, kernel, ctypes, W, executable, created):
        self._handle,self._kernel,self._ctypes,self._W=handle,kernel,ctypes,W
        self._executable,self._created=executable,created
        self._dead=False

    @classmethod
    def pin(cls,pid,target,backend):
        if sys.platform!='win32':raise OfficeUnavailable('Office kräver Windows.')
        import ctypes
        from ctypes import wintypes as W
        kernel=ctypes.WinDLL('kernel32',use_last_error=True)
        kernel.OpenProcess.argtypes=[W.DWORD,W.BOOL,W.DWORD];kernel.OpenProcess.restype=W.HANDLE
        kernel.CloseHandle.argtypes=[W.HANDLE];kernel.CloseHandle.restype=W.BOOL
        kernel.WaitForSingleObject.argtypes=[W.HANDLE,W.DWORD];kernel.WaitForSingleObject.restype=W.DWORD
        kernel.GetProcessTimes.argtypes=[W.HANDLE,*([ctypes.POINTER(W.FILETIME)]*4)];kernel.GetProcessTimes.restype=W.BOOL
        kernel.QueryFullProcessImageNameW.argtypes=[W.HANDLE,W.DWORD,W.LPWSTR,ctypes.POINTER(W.DWORD)]
        kernel.QueryFullProcessImageNameW.restype=W.BOOL
        handle=kernel.OpenProcess(0x1000|0x100000,False,pid)  # query-limited + synchronize
        if not handle:raise OfficeUnavailable('Office-processen kunde inte verifieras.')
        try:
            # Re-enumerate after acquiring the handle; failure never starts duplicates.
            matches=[p for p in backend.running() if p.pid==pid and matching_office(p,target)]
            if len(matches)!=1:raise OfficeUnavailable('Office-processens identitet ändrades.')
            value=cls(handle,kernel,ctypes,W,str(target.engine),None)
            value._created=value._identity()
            if value._created is None or not value.alive():raise OfficeUnavailable('Office-processen avslutades.')
            return value
        except BaseException:
            kernel.CloseHandle(handle);raise

    def _identity(self):
        c,W,k=self._ctypes,self._W,self._kernel
        created,exit_time,kernel_time,user_time=W.FILETIME(),W.FILETIME(),W.FILETIME(),W.FILETIME()
        if not k.GetProcessTimes(self._handle,*[c.byref(x) for x in (created,exit_time,kernel_time,user_time)]):return None
        buffer=c.create_unicode_buffer(32768);size=W.DWORD(len(buffer))
        if not k.QueryFullProcessImageNameW(self._handle,0,buffer,c.byref(size)):return None
        norm=lambda p:ntpath.normcase(ntpath.normpath(p))
        if norm(buffer.value)!=norm(self._executable):return None
        return (created.dwHighDateTime<<32)|created.dwLowDateTime

    def alive(self):
        if self._dead or self._handle is None:return False
        try:
            # A held handle refers to the original process even after PID reuse.
            self._dead=(self._kernel.WaitForSingleObject(self._handle,0)!=258 or self._identity()!=self._created)
        except Exception:self._dead=True
        return not self._dead

    def close(self):
        self._dead=True
        if self._handle is not None:
            self._kernel.CloseHandle(self._handle);self._handle=None


def acquire_office_process(target,backend):
    target.verify()
    with backend.lock():
        matches=[p for p in backend.running() if matching_office(p,target)]
        if len(matches)>1:raise OfficeUnavailable('Flera Office-spel är öppna. Välj en enda session.')
        if matches:return WindowsProcessLease.pin(matches[0].pid,target,backend)
        pid=backend.start(target.argv(),str(target.project.parent))
        deadline=time.monotonic()+90
        while time.monotonic()<deadline:
            matches=[p for p in backend.running() if p.pid==pid and matching_office(p,target)]
            if matches:return WindowsProcessLease.pin(pid,target,backend)
            time.sleep(.25)
    raise OfficeUnavailable('Office-starten kunde inte verifieras inom 90 sekunder.')
