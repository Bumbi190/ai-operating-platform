using System.Buffers.Binary;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
namespace Omnira.CodeBroker.Workspace;
internal static class ProbeSpecification {
 internal static readonly string[] Protections={
  "network=none","rootfs=read-only","user=non-root numeric","cap-drop=ALL","no-new-privileges","not privileged",
  "pids-limit","memory limit","swap bounded","cpu limit","no bind mounts","no mounts","no docker socket",
  "tmpfs only /tmp noexec","env allowlist","no secret env","image=pinned digest","image id matches","no devices",
  "no host namespaces","no published ports","fixed entrypoint"
 };
 internal static bool Hash(string? s)=>s!=null&&Regex.IsMatch(s,@"^[0-9a-f]{64}$");
 internal static bool ImageId(string? s)=>s!=null&&Regex.IsMatch(s,@"^sha256:[0-9a-f]{64}$");
 internal static bool ContainerId(string? s)=>Hash(s);
 internal static string Name(Guid attempt)=>"omnira-sdf-win-probe-"+attempt.ToString("N");
 internal static bool IsName(string? s)=>s!=null&&Regex.IsMatch(s,@"^omnira-sdf-win-probe-[0-9a-f]{32}$");
 internal static object Create(Guid attempt,string image){
  if(!WorkspaceJson.Uuid(attempt.ToString(),true)||!ImageId(image))throw new WorkspaceException("protocol_invalid");
  return new{
   Image=image,Cmd=new[]{"id"},Entrypoint=new[]{"/bin/busybox"},User="10001:10001",WorkingDir="/tmp",Env=new[]{"HOME=/tmp","LANG=C.UTF-8"},
   Tty=false,OpenStdin=false,AttachStdin=false,AttachStdout=true,AttachStderr=true,StopTimeout=2,Healthcheck=new{Test=new[]{"NONE"}},
   Labels=new Dictionary<string,string>{{"omnira.sdf.windows.probe","1"},{"omnira.sdf.windows.attempt",attempt.ToString()}},
   HostConfig=new{
    NetworkMode="none",CapDrop=new[]{"ALL"},SecurityOpt=new[]{"no-new-privileges"},ReadonlyRootfs=true,Privileged=false,PidsLimit=64,
    Memory=134217728L,MemorySwap=134217728L,NanoCpus=500000000L,Ulimits=new[]{new{Name="nofile",Soft=256,Hard=256}},
    Tmpfs=new Dictionary<string,string>{{"/tmp","rw,noexec,nosuid,nodev,size=16m,mode=1777"}},IpcMode="private",CgroupnsMode="private",
    RestartPolicy=new{Name="no",MaximumRetryCount=0},AutoRemove=false,Binds=Array.Empty<string>(),Mounts=Array.Empty<object>(),Devices=Array.Empty<object>(),
    PortBindings=new Dictionary<string,object>(),PublishAllPorts=false
   }
  };
 }
 static JsonElement Get(JsonElement r,string key){if(r.ValueKind!=JsonValueKind.Object||!r.TryGetProperty(key,out var v))throw new WorkspaceException("protection_missing");return v;}
 static string String(JsonElement r,string key){var v=Get(r,key);if(v.ValueKind!=JsonValueKind.String)throw new WorkspaceException("protection_missing");return v.GetString()!;}
 static void Need(bool v){if(!v)throw new WorkspaceException("protection_missing");}
 static bool IsBool(JsonElement r,string key,bool value)=>Get(r,key).ValueKind==(value?JsonValueKind.True:JsonValueKind.False);
 static bool Number(JsonElement r,string key,long n)=>Get(r,key).TryGetInt64(out var value)&&value==n;
 static bool ArrayEquals(JsonElement r,params string[] wanted)=>r.ValueKind==JsonValueKind.Array&&r.EnumerateArray().All(v=>v.ValueKind==JsonValueKind.String)&&r.EnumerateArray().Select(v=>v.GetString()).SequenceEqual(wanted);
 static bool Empty(JsonElement r,string key){
  if(!r.TryGetProperty(key,out var v)||v.ValueKind==JsonValueKind.Null)return true;
  return v.ValueKind==JsonValueKind.Array?v.GetArrayLength()==0:v.ValueKind==JsonValueKind.Object&&!v.EnumerateObject().Any();
 }
 internal static string Verify(JsonElement root,Guid attempt,string image,string? expectedId,bool beforeStart=false,bool finished=false){
  var id=String(root,"Id");Need(ContainerId(id)&&(expectedId==null||id==expectedId)&&String(root,"Name")=="/"+Name(attempt)&&String(root,"Image")==image);
  var config=Get(root,"Config");var host=Get(root,"HostConfig");var labels=Get(config,"Labels");
  Need(String(labels,"omnira.sdf.windows.probe")=="1"&&String(labels,"omnira.sdf.windows.attempt")==attempt.ToString()&&String(config,"Image")==image);
  Need(String(config,"User")=="10001:10001"&&String(config,"WorkingDir")=="/tmp"&&ArrayEquals(Get(config,"Entrypoint"),"/bin/busybox")&&ArrayEquals(Get(config,"Cmd"),"id"));
  Need(IsBool(config,"Tty",false)&&IsBool(config,"OpenStdin",false)&&Empty(config,"Volumes"));
  var env=Get(config,"Env");Need(env.ValueKind==JsonValueKind.Array&&env.GetArrayLength()==3&&env.EnumerateArray().All(v=>v.ValueKind==JsonValueKind.String));
  var values=env.EnumerateArray().Select(v=>v.GetString()!).Order(StringComparer.Ordinal).ToArray();
  Need(values.SequenceEqual(new[]{"HOME=/tmp","LANG=C.UTF-8","PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"}.Order(StringComparer.Ordinal)));
  Need(String(host,"NetworkMode")=="none"&&IsBool(host,"ReadonlyRootfs",true)&&IsBool(host,"Privileged",false)&&ArrayEquals(Get(host,"CapDrop"),"ALL")&&Empty(host,"CapAdd"));
  var security=Get(host,"SecurityOpt");Need(security.ValueKind==JsonValueKind.Array&&security.GetArrayLength()==1&&Regex.IsMatch(security[0].GetString()??"",@"^no-new-privileges(?::true)?$"));
  Need(Number(host,"PidsLimit",64)&&Number(host,"Memory",134217728)&&Number(host,"MemorySwap",134217728)&&Number(host,"NanoCpus",500000000));
  var ulimits=Get(host,"Ulimits");Need(ulimits.ValueKind==JsonValueKind.Array&&ulimits.GetArrayLength()==1&&String(ulimits[0],"Name")=="nofile"&&Number(ulimits[0],"Soft",256)&&Number(ulimits[0],"Hard",256));
  var tmpfs=Get(host,"Tmpfs");Need(tmpfs.ValueKind==JsonValueKind.Object&&tmpfs.EnumerateObject().Count()==1&&String(tmpfs,"/tmp")=="rw,noexec,nosuid,nodev,size=16m,mode=1777");
  Need(String(host,"IpcMode")=="private"&&String(Get(host,"RestartPolicy"),"Name")=="no"&&Number(Get(host,"RestartPolicy"),"MaximumRetryCount",0)&&IsBool(host,"AutoRemove",false));
  foreach(var key in new[]{"PidMode","UTSMode","UsernsMode","CgroupnsMode"})if(host.TryGetProperty(key,out var ns))Need(ns.ValueKind==JsonValueKind.String&&(ns.GetString()==""||ns.GetString()=="private"));
  foreach(var key in new[]{"Binds","Mounts","Devices","DeviceRequests","PortBindings","Links","VolumesFrom","ExtraHosts","GroupAdd","Sysctls"})Need(Empty(host,key));
  Need(IsBool(host,"PublishAllPorts",false)&&Empty(root,"Mounts")&&ArrayEquals(Get(Get(config,"Healthcheck"),"Test"),"NONE")&&Number(config,"StopTimeout",2));
  var state=Get(root,"State");if(beforeStart)Need(IsBool(state,"Running",false)&&String(state,"Status")=="created");
  if(finished)Need(IsBool(state,"Running",false)&&String(state,"Status")=="exited"&&Number(state,"ExitCode",0));
  return id;
 }
 internal static void VerifyLogs(byte[] bytes){
  using var stdout=new MemoryStream();using var stderr=new MemoryStream();int offset=0;
  while(offset<bytes.Length){
   if(bytes.Length-offset<8||bytes[offset] is not (1 or 2)||bytes[offset+1]!=0||bytes[offset+2]!=0||bytes[offset+3]!=0)throw new WorkspaceException("probe_failed");
   var length=BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(offset+4,4));if(length>262144||length>bytes.Length-offset-8)throw new WorkspaceException("probe_failed");
   var dest=bytes[offset]==1?stdout:stderr;dest.Write(bytes,offset+8,(int)length);offset+=8+(int)length;
  }
  if(stderr.Length!=0||stdout.Length>256)throw new WorkspaceException("probe_failed");
  var text=new UTF8Encoding(false,true).GetString(stdout.ToArray()).TrimEnd('\n').TrimEnd('\r');
  if(!Regex.IsMatch(text,@"^uid=10001 gid=10001(?: groups=10001)?$"))throw new WorkspaceException("probe_failed");
 }
}
