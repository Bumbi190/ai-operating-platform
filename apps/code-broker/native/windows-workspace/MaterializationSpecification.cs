using System.Text.Json;
namespace Omnira.CodeBroker.Workspace;
internal sealed record MaterializationIdentity(Guid Attempt,WorkspaceBinding Binding,string ManifestSha256,NodeToolchainProfile Profile){
 internal void Validate(){if(!WorkspaceJson.Uuid(Attempt.ToString(),true)||!ProbeSpecification.Hash(ManifestSha256))throw new WorkspaceException("input_invalid");new WorkspaceRequest("sdf.windows_workspace_request.v1",Binding.WorkId,Binding.RepositoryId,Binding.PinnedBaseSha,Binding.AdmissionHash,Binding.ClaimId,Binding.Fence).Validate();if(Binding.RepositoryId!=RepositoryLocation.RepositoryId)throw new WorkspaceException("input_invalid");ToolchainProfile.RequireReady(Profile);}
 internal string ProfileHash=>ToolchainProfile.Hash(Profile);
 internal string BindingHash=>SourceSnapshot.Hex(System.Security.Cryptography.SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(Binding,new JsonSerializerOptions{PropertyNamingPolicy=JsonNamingPolicy.CamelCase})));
}
internal static class MaterializationSpecification {
 internal static string VolumeName(Guid a)=>"omnira-sdf-src-"+a.ToString("N");
 internal static string ContainerName(Guid a)=>"omnira-sdf-node-"+a.ToString("N");
 internal static Dictionary<string,string> Labels(MaterializationIdentity i){i.Validate();return new(){
  ["omnira.sdf.materialization.version"]="1",["omnira.sdf.materialization.attemptId"]=i.Attempt.ToString(),["omnira.sdf.materialization.bindingHash"]=i.BindingHash,["omnira.sdf.materialization.sourceManifestSha256"]=i.ManifestSha256,["omnira.sdf.materialization.toolchainProfileHash"]=i.ProfileHash
 };}
 internal static object CreateVolume(MaterializationIdentity i)=>new{Name=VolumeName(i.Attempt),Driver="local",DriverOpts=new Dictionary<string,string>(),Labels=Labels(i)};
 internal static object CreateContainer(MaterializationIdentity i){
  var labels=Labels(i);labels.Add("omnira.sdf.node.version","1");labels.Add("omnira.sdf.node.lock",ToolchainProfile.LockSha256);labels.Add("omnira.sdf.node.recipe",i.Profile.RecipeSha256);labels.Add("omnira.sdf.node.runner",i.Profile.RunnerSha256);
  return new{
   Image=i.Profile.ImageId,Cmd=Array.Empty<string>(),Entrypoint=new[]{"/usr/local/bin/node","/opt/omnira/fixture-runner.mjs"},User="10001:10001",WorkingDir="/workspace/repo",
   Env=i.Profile.ImageEnvironment.Concat(new[]{"OMNIRA_SOURCE_MANIFEST_SHA256="+i.ManifestSha256,"OMNIRA_DEPENDENCY_INVENTORY_SHA256="+i.Profile.InventorySha256}).ToArray(),
   Tty=false,OpenStdin=false,AttachStdin=false,AttachStdout=true,AttachStderr=true,StopTimeout=2,Healthcheck=new{Test=new[]{"NONE"}},Labels=labels,
   HostConfig=new{
    NetworkMode="none",CapDrop=new[]{"ALL"},SecurityOpt=new[]{"no-new-privileges"},ReadonlyRootfs=true,Privileged=false,PidsLimit=64,Init=false,
    Memory=536870912L,MemorySwap=536870912L,NanoCpus=1000000000L,Ulimits=new[]{new{Name="nofile",Soft=256,Hard=256}},
    Tmpfs=new Dictionary<string,string>{{"/tmp","rw,noexec,nosuid,nodev,size=67108864,mode=1777"}},IpcMode="private",CgroupnsMode="private",
    RestartPolicy=new{Name="no",MaximumRetryCount=0},AutoRemove=false,Binds=Array.Empty<string>(),
    Mounts=new[]{new{Type="volume",Source=VolumeName(i.Attempt),Target="/workspace/repo",ReadOnly=false,VolumeOptions=new{NoCopy=false}}},
    Devices=Array.Empty<object>(),PortBindings=new Dictionary<string,object>(),PublishAllPorts=false
   }
  };
 }
 internal static string VerifyVolume(JsonElement v,MaterializationIdentity i){
  i.Validate();Need(Text(v,"Name")==VolumeName(i.Attempt)&&Text(v,"Driver")=="local"&&Text(v,"Scope")=="local"&&Empty(v,"Options"));
  VerifyLabels(Get(v,"Labels"),Labels(i));
  var mount=Text(v,"Mountpoint");Need(mount=="/var/lib/docker/volumes/"+VolumeName(i.Attempt)+"/_data");return mount;
 }
 internal static string VerifyContainer(JsonElement r,MaterializationIdentity i,string mount,string? expectedId,bool beforeStart=false,bool finished=false){
  i.Validate();var id=Text(r,"Id");Need(ProbeSpecification.ContainerId(id)&&(expectedId==null||id==expectedId)&&Text(r,"Name")=="/"+ContainerName(i.Attempt)&&Text(r,"Image")==i.Profile.ImageId);
  var config=Get(r,"Config");var host=Get(r,"HostConfig");var body=JsonSerializer.SerializeToElement(CreateContainer(i));
  VerifyLabels(Get(config,"Labels"),JsonSerializer.Deserialize<Dictionary<string,string>>(Get(body,"Labels"))!);
  Need(Text(config,"Image")==i.Profile.ImageId&&Text(config,"User")=="10001:10001"&&Text(config,"WorkingDir")=="/workspace/repo");
  Need(Strings(Get(config,"Entrypoint")).SequenceEqual(new[]{"/usr/local/bin/node","/opt/omnira/fixture-runner.mjs"})&&(!config.TryGetProperty("Cmd",out var cmd)||Strings(cmd).Length==0));
  Need(Strings(Get(config,"Env")).Order(StringComparer.Ordinal).SequenceEqual(Strings(Get(body,"Env")).Order(StringComparer.Ordinal)));
  Need(Bool(config,"Tty",false)&&Bool(config,"OpenStdin",false)&&Empty(config,"Volumes")&&Strings(Get(Get(config,"Healthcheck"),"Test")).SequenceEqual(new[]{"NONE"})&&Number(config,"StopTimeout",2));
  Need(Text(host,"NetworkMode")=="none"&&Bool(host,"ReadonlyRootfs",true)&&Bool(host,"Privileged",false)&&Strings(Get(host,"CapDrop")).SequenceEqual(new[]{"ALL"})&&Empty(host,"CapAdd"));
  var security=Strings(Get(host,"SecurityOpt"));Need(security.Length==1&&(security[0]=="no-new-privileges"||security[0]=="no-new-privileges:true"));
  Need(Number(host,"PidsLimit",64)&&Number(host,"Memory",536870912)&&Number(host,"MemorySwap",536870912)&&Number(host,"NanoCpus",1000000000));
  var u=Get(host,"Ulimits");Need(u.ValueKind==JsonValueKind.Array&&u.GetArrayLength()==1&&Text(u[0],"Name")=="nofile"&&Number(u[0],"Soft",256)&&Number(u[0],"Hard",256));
  var tmp=Get(host,"Tmpfs");Need(tmp.ValueKind==JsonValueKind.Object&&tmp.EnumerateObject().Count()==1&&Text(tmp,"/tmp")=="rw,noexec,nosuid,nodev,size=67108864,mode=1777");
  Need(Text(host,"IpcMode")=="private"&&Text(Get(host,"RestartPolicy"),"Name")=="no"&&Number(Get(host,"RestartPolicy"),"MaximumRetryCount",0)&&Bool(host,"AutoRemove",false)&&Bool(host,"PublishAllPorts",false));
  foreach(var key in new[]{"PidMode","UTSMode","UsernsMode","CgroupnsMode"})if(host.TryGetProperty(key,out var ns))Need(ns.ValueKind==JsonValueKind.String&&(ns.GetString()==""||ns.GetString()=="private"));
  foreach(var key in new[]{"Binds","Devices","DeviceRequests","PortBindings","Links","VolumesFrom","ExtraHosts","GroupAdd","Sysctls"})Need(Empty(host,key));
  if(host.TryGetProperty("Init",out var init))Need(init.ValueKind is JsonValueKind.False or JsonValueKind.Null);
  var hm=Get(host,"Mounts");Need(hm.ValueKind==JsonValueKind.Array&&hm.GetArrayLength()==1);var h=hm[0];
  Need(Text(h,"Type")=="volume"&&Text(h,"Source")==VolumeName(i.Attempt)&&Text(h,"Target")=="/workspace/repo"&&DefaultFalse(h,"ReadOnly")&&VolumeOptions(h));
  var mounts=Get(r,"Mounts");Need(mounts.ValueKind==JsonValueKind.Array&&mounts.GetArrayLength()==1);var m=mounts[0];
  Need(Text(m,"Type")=="volume"&&Text(m,"Name")==VolumeName(i.Attempt)&&Text(m,"Driver")=="local"&&Text(m,"Destination")=="/workspace/repo"&&Text(m,"Source")==mount&&Bool(m,"RW",true));
  var state=Get(r,"State");if(beforeStart)Need(Bool(state,"Running",false)&&Text(state,"Status")=="created");
  if(finished)Need(Bool(state,"Running",false)&&Text(state,"Status")=="exited"&&Number(state,"ExitCode",0)&&Bool(state,"OOMKilled",false));return id;
 }
 static bool DefaultFalse(JsonElement r,string key)=>!r.TryGetProperty(key,out var v)||v.ValueKind==JsonValueKind.False;
 static bool VolumeOptions(JsonElement h){
  foreach(var key in new[]{"BindOptions","ImageOptions","TmpfsOptions","ClusterOptions"})Need(Empty(h,key));
  if(h.TryGetProperty("Consistency",out var c))Need(c.ValueKind==JsonValueKind.String&&c.GetString()=="");
  if(!h.TryGetProperty("VolumeOptions",out var v)||v.ValueKind==JsonValueKind.Null)return true;
  Need(v.ValueKind==JsonValueKind.Object&&v.EnumerateObject().All(p=>new[]{"NoCopy","Labels","Subpath","DriverConfig"}.Contains(p.Name)));
  Need(DefaultFalse(v,"NoCopy")&&Empty(v,"Labels")&&Empty(v,"DriverConfig"));
  if(v.TryGetProperty("Subpath",out var s))Need(s.ValueKind==JsonValueKind.String&&s.GetString()=="");
  return true;
 }
 internal static JsonElement Get(JsonElement r,string key){if(r.ValueKind!=JsonValueKind.Object||!r.TryGetProperty(key,out var v))throw new WorkspaceException("materialization_unverified");return v;}
 internal static string Text(JsonElement r,string key){var v=Get(r,key);if(v.ValueKind!=JsonValueKind.String)throw new WorkspaceException("materialization_unverified");return v.GetString()!;}
 internal static void Need(bool ok){if(!ok)throw new WorkspaceException("materialization_unverified");}
 internal static bool Bool(JsonElement r,string key,bool value)=>Get(r,key).ValueKind==(value?JsonValueKind.True:JsonValueKind.False);
 internal static bool Number(JsonElement r,string key,long expected)=>Get(r,key).TryGetInt64(out var n)&&n==expected;
 internal static string[] Strings(JsonElement r){if(r.ValueKind==JsonValueKind.Null)return Array.Empty<string>();Need(r.ValueKind==JsonValueKind.Array&&r.EnumerateArray().All(v=>v.ValueKind==JsonValueKind.String));return r.EnumerateArray().Select(v=>v.GetString()!).ToArray();}
 internal static bool Empty(JsonElement r,string key){if(!r.TryGetProperty(key,out var v)||v.ValueKind==JsonValueKind.Null)return true;return v.ValueKind==JsonValueKind.Array?v.GetArrayLength()==0:v.ValueKind==JsonValueKind.Object&&!v.EnumerateObject().Any();}
 internal static void VerifyLabels(JsonElement actual,IReadOnlyDictionary<string,string> expected){Need(actual.ValueKind==JsonValueKind.Object&&actual.EnumerateObject().Count()==expected.Count);foreach(var p in expected)Need(Text(actual,p.Key)==p.Value);}
}
