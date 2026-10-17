"""Windows Credential Manager only; never fall back to a plaintext secret."""
import ctypes
import hashlib
import os
def connection_key(origin,project):return 'OmniraSales/'+hashlib.sha256((origin.rstrip('/')+'\n'+project).encode()).hexdigest()
class CredentialStore:
    def __init__(self):
        if os.name!='nt':raise OSError('WINDOWS_CREDENTIAL_STORE_REQUIRED')
        from ctypes import wintypes as w
        class Credential(ctypes.Structure):
            _fields_=[('Flags',w.DWORD),('Type',w.DWORD),('TargetName',w.LPWSTR),('Comment',w.LPWSTR),('LastWritten',w.FILETIME),('CredentialBlobSize',w.DWORD),('CredentialBlob',ctypes.POINTER(ctypes.c_ubyte)),('Persist',w.DWORD),('AttributeCount',w.DWORD),('Attributes',ctypes.c_void_p),('TargetAlias',w.LPWSTR),('UserName',w.LPWSTR)]
        self.Credential=Credential;self.api=ctypes.WinDLL('Advapi32.dll',use_last_error=True)
        self.api.CredWriteW.argtypes=[ctypes.POINTER(Credential),w.DWORD];self.api.CredWriteW.restype=w.BOOL
        self.api.CredReadW.argtypes=[w.LPCWSTR,w.DWORD,w.DWORD,ctypes.POINTER(ctypes.POINTER(Credential))];self.api.CredReadW.restype=w.BOOL
        self.api.CredDeleteW.argtypes=[w.LPCWSTR,w.DWORD,w.DWORD];self.api.CredDeleteW.restype=w.BOOL
        self.api.CredFree.argtypes=[ctypes.c_void_p];self.api.CredFree.restype=None
    def write(self,name,secret):
        raw=secret.encode()
        if not 1<=len(raw)<=2560:raise ValueError('CREDENTIAL_SIZE_INVALID')
        blob=(ctypes.c_ubyte*len(raw)).from_buffer_copy(raw)
        value=self.Credential();value.Type=1;value.TargetName=name;value.UserName='OmniraSales';value.CredentialBlobSize=len(raw);value.CredentialBlob=blob;value.Persist=2
        if not self.api.CredWriteW(ctypes.byref(value),0):raise OSError('CREDENTIAL_WRITE_FAILED')
    def read(self,name):
        result=ctypes.POINTER(self.Credential)()
        if not self.api.CredReadW(name,1,0,ctypes.byref(result)):
            if ctypes.get_last_error()==1168:raise FileNotFoundError('CREDENTIAL_NOT_FOUND')
            raise OSError('CREDENTIAL_READ_FAILED')
        try:return ctypes.string_at(result.contents.CredentialBlob,result.contents.CredentialBlobSize).decode()
        finally:self.api.CredFree(result)

    def delete(self,name):
        if not self.api.CredDeleteW(name,1,0) and ctypes.get_last_error()!=1168:raise OSError("CREDENTIAL_DELETE_FAILED")
