using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Win32.SafeHandles;
using Omnira.CodeBroker.Host;

namespace Omnira.CodeBroker.Workspace;
/** Retains every inspected component; no arbitrary filesystem write operation is provided. */
public sealed class ProtectedPathLease:IDisposable {
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
 static extern SafeFileHandle CreateFileW(string name,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
 readonly List<SafeFileHandle> handles=new();readonly TargetDefinition target;readonly string userSid;readonly string pin;
 public TargetEvidence Evidence{get;}
 internal string PathValue=>NativeFileEvidence.CanonicalInput(target.Path);
 ProtectedPathLease(TargetDefinition target,string userSid){
  this.target=target;this.userSid=userSid;
  try{
   var path=NativeFileEvidence.CanonicalInput(target.Path);
   if(path.Split('\\').Skip(1).Any(segment=>Regex.IsMatch(segment,@"^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)",RegexOptions.IgnoreCase|RegexOptions.CultureInvariant)))throw new WorkspaceException("unsafe_path");
   var current=System.IO.Path.GetPathRoot(path)!;var paths=new List<string>{current};
   foreach(var segment in path[current.Length..].Split('\\',StringSplitOptions.RemoveEmptyEntries)){current=System.IO.Path.Combine(current,segment);paths.Add(current);}
   for(int i=0;i<paths.Count;i++){
    bool file=i==paths.Count-1&&!target.IsDirectory;
    var handle=CreateFileW(paths[i],0x20081u,1,IntPtr.Zero,3,0x02200000,IntPtr.Zero);
    if(handle.IsInvalid){handle.Dispose();throw new WorkspaceException("unsafe_path");}
    handles.Add(handle);
    // OPEN_REPARSE_POINT protects the component itself. Reject before traversing the next one.
    NativeFileEvidence.Inspect(new TargetDefinition("component",paths[i],!file,null));
    // Apply ACL policy once against the COMPLETE target: root/ancestor rights differ from leaf rights.
   }
   Evidence=NativeFileEvidence.Inspect(target);
   if(!HostPolicy.Evaluate(Evidence,target,userSid).Allowed)throw new WorkspaceException("unsafe_path");
   pin=NativeFileEvidence.Hash(JsonSerializer.Serialize(Evidence));
  }catch{Dispose();throw;}
 }
 public static ProtectedPathLease Acquire(TargetDefinition target,string userSid)=>new(target,userSid);
 public void ValidateUnchanged(){
  if(handles.Count==0)throw new WorkspaceException("evidence_changed");
  var again=NativeFileEvidence.Inspect(target);
  if(!HostPolicy.Evaluate(again,target,userSid).Allowed||NativeFileEvidence.Hash(JsonSerializer.Serialize(again))!=pin)throw new WorkspaceException("evidence_changed");
 }
 public void Dispose(){for(int i=handles.Count-1;i>=0;i--)handles[i].Dispose();handles.Clear();}
}
