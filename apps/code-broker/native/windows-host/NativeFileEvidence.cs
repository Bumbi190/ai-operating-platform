using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace Omnira.CodeBroker.Host;
public static class NativeFileEvidence {
    const uint ReadControl=0x20000,ReadAttributes=0x80,ReadData=1;
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
    static extern SafeFileHandle CreateFileW(string name,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
    static extern uint GetFinalPathNameByHandleW(SafeFileHandle file,StringBuilder path,uint length,uint flags);
    [DllImport("kernel32.dll",SetLastError=true)]
    static extern bool GetFileInformationByHandleEx(SafeFileHandle file,int kind,IntPtr data,uint size);
    [DllImport("kernel32.dll",SetLastError=true)]
    static extern bool GetFileInformationByHandle(SafeFileHandle file,out FileInformation info);
    [DllImport("advapi32.dll",SetLastError=true)]
    static extern uint GetSecurityInfo(SafeFileHandle file,int type,uint requested,out IntPtr owner,out IntPtr group,out IntPtr dacl,out IntPtr sacl,out IntPtr descriptor);
    [DllImport("advapi32.dll")] static extern uint GetSecurityDescriptorLength(IntPtr descriptor);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
    [StructLayout(LayoutKind.Sequential)] struct FileTime {public uint Low,High;}
    [StructLayout(LayoutKind.Sequential)] struct FileInformation {
        public uint Attributes;public FileTime Creation,Access,Write;public uint Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;
    }
    public static string CanonicalInput(string input) {
        if(!OperatingSystem.IsWindows()||input.Length<3||!char.IsAsciiLetter(input[0])||input[1]!=':'||(input[2]!='/'&&input[2]!='\\')||
           input.Any(c=>char.IsControl(c))||input.Skip(2).Contains(':'))throw new HostCheckException("path_alias");
        var normalized=input.Replace('/','\\');
        var tail=normalized[3..];
        if(tail.Length==0)return normalized;
        var parts=tail.Split('\\');
        if(parts.Any(p=>p.Length==0||p=="."||p==".."||p.EndsWith('.')||p.EndsWith(' ')||p.Contains('~')||p!=p.Normalize(NormalizationForm.FormC)))
            throw new HostCheckException("path_alias");
        return Path.GetFullPath(normalized);
    }
    public static TargetEvidence Inspect(TargetDefinition target) {
        var path=CanonicalInput(target.Path);
        var paths=new List<string>{Path.GetPathRoot(path)!};
        var relative=path[paths[0].Length..];
        foreach(var segment in relative.Split('\\',StringSplitOptions.RemoveEmptyEntries))
            paths.Add(Path.Combine(paths[^1],segment));
        var handles=new List<SafeFileHandle>();var components=new List<ComponentEvidence>();
        try {
            for(int i=0;i<paths.Count;i++) {
                var leaf=i==paths.Count-1;
                var handle=CreateFileW(paths[i],ReadControl|ReadAttributes|(leaf&&!target.IsDirectory?ReadData:0),7,IntPtr.Zero,3,0x02200000,IntPtr.Zero);
                if(handle.IsInvalid){handle.Dispose();throw new HostCheckException(Marshal.GetLastWin32Error() is 2 or 3?"missing_target":"unreadable_target");}
                handles.Add(handle);
                var pointer=Marshal.AllocHGlobal(8);
                uint attributes,tag;
                try {
                    if(!GetFileInformationByHandleEx(handle,9,pointer,8))throw new HostCheckException("unreadable_target");
                    attributes=unchecked((uint)Marshal.ReadInt32(pointer));tag=unchecked((uint)Marshal.ReadInt32(pointer,4));
                } finally {Marshal.FreeHGlobal(pointer);}
                if((attributes&0x400)!=0||tag!=0)throw new HostCheckException("reparse_point");
                var directory=(attributes&0x10)!=0;
                bool sensitive=false;
                if(directory) {
                    pointer=Marshal.AllocHGlobal(4);
                    try {
                        if(!GetFileInformationByHandleEx(handle,23,pointer,4))throw new HostCheckException("acl_unproven");
                        sensitive=(Marshal.ReadInt32(pointer)&1)!=0;
                    } finally {Marshal.FreeHGlobal(pointer);}
                }
                if(sensitive)throw new HostCheckException("case_sensitive_directory");
                var final=new StringBuilder(4096);var length=GetFinalPathNameByHandleW(handle,final,4096,0);
                if(length==0||length>=4096)throw new HostCheckException("path_alias");
                var actual=final.ToString();
                if(actual.StartsWith("\\\\?\\",StringComparison.Ordinal))actual=actual[4..];
                if(!string.Equals(actual,paths[i],StringComparison.OrdinalIgnoreCase))throw new HostCheckException("path_alias");
                if(!GetFileInformationByHandle(handle,out var info))throw new HostCheckException("unreadable_target");
                var id=Hash($"{info.Volume:x8}:{info.IndexHigh:x8}:{info.IndexLow:x8}");
                var security=ReadSecurity(handle);
                components.Add(new(actual,id,security.Owner,security.Aces,directory,false,sensitive));
            }
            string? sha=null;
            if(!target.IsDirectory) {
                var leaf=handles[^1];
                if(!GetFileInformationByHandle(leaf,out var before))throw new HostCheckException("unreadable_target");
                using(var borrowed=new SafeFileHandle(leaf.DangerousGetHandle(),false))
                using(var stream=new FileStream(borrowed,FileAccess.Read))
                    sha=Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
                if(!GetFileInformationByHandle(leaf,out var after)||before.Volume!=after.Volume||before.IndexHigh!=after.IndexHigh||before.IndexLow!=after.IndexLow||
                    before.Write.Low!=after.Write.Low||before.Write.High!=after.Write.High||before.SizeHigh!=after.SizeHigh||before.SizeLow!=after.SizeLow)
                    throw new HostCheckException("hash_changed");
            }
            return new(target.Id,components.ToArray(),sha);
        } finally {foreach(var handle in handles)handle.Dispose();}
    }
    static (string Owner,AceEvidence[]? Aces) ReadSecurity(SafeFileHandle handle) {
        IntPtr descriptor=IntPtr.Zero;
        try {
            if(GetSecurityInfo(handle,1,5,out _,out _,out _,out _,out descriptor)!=0||descriptor==IntPtr.Zero)throw new HostCheckException("acl_unproven");
            var size=GetSecurityDescriptorLength(descriptor);
            if(size==0||size>262144)throw new HostCheckException("acl_unproven");
            var bytes=new byte[size];Marshal.Copy(descriptor,bytes,0,(int)size);
            var security=new RawSecurityDescriptor(bytes,0);
            if(security.Owner==null)throw new HostCheckException("owner_untrusted");
            if(security.DiscretionaryAcl==null)return(security.Owner.Value,null);
            var aces=new List<AceEvidence>();
            foreach(GenericAce ace in security.DiscretionaryAcl) {
                if(ace is CommonAce common&&!common.IsCallback&&(common.AceQualifier==AceQualifier.AccessAllowed||common.AceQualifier==AceQualifier.AccessDenied))
                    aces.Add(new(common.AceQualifier==AceQualifier.AccessAllowed?"allow":"deny",common.SecurityIdentifier.Value,unchecked((uint)common.AccessMask),(common.AceFlags&AceFlags.InheritOnly)!=0));
                else aces.Add(new("unknown","",0,false));
            }
            return(security.Owner.Value,aces.ToArray());
        } finally {if(descriptor!=IntPtr.Zero)LocalFree(descriptor);}
    }
    public static string Hash(string text)=>Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text))).ToLowerInvariant();
}
