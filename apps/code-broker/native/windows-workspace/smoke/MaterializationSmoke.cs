using System.Text.Json;
using System.Text.Json.Nodes;
using Omnira.CodeBroker.Workspace;
namespace Omnira.CodeBroker.Workspace.Smoke;
internal static class MaterializationSmoke {
 internal static readonly WorkspaceBinding Binding=new("c435e423-d964-428b-b5c0-4060d89ce3c6",RepositoryLocation.RepositoryId,new string('b',40),new string('a',64),"2e0f09eb-cf7e-4619-834b-d78aa0ca5a7a",1);
 internal static MaterializationIdentity Identity()=>new(Guid.Parse("33333333-3333-4333-8333-333333333333"),Binding,new string('e',64),ToolchainSmoke.Fixture());
 internal static JsonObject Volume(MaterializationIdentity i){var body=JsonSerializer.SerializeToNode(MaterializationSpecification.CreateVolume(i))!.AsObject();body["Name"]=MaterializationSpecification.VolumeName(i.Attempt);body["Options"]=body["DriverOpts"]!.DeepClone();body.Remove("DriverOpts");body["Scope"]="local";body["Mountpoint"]="/var/lib/docker/volumes/"+MaterializationSpecification.VolumeName(i.Attempt)+"/_data";return body;}
 internal static JsonObject Container(MaterializationIdentity i){
  var request=JsonSerializer.SerializeToNode(MaterializationSpecification.CreateContainer(i))!.AsObject();var config=request.DeepClone().AsObject();config.Remove("HostConfig");
  return new JsonObject{{"Id",new string('d',64)},{"Name","/"+MaterializationSpecification.ContainerName(i.Attempt)},{"Image",i.Profile.ImageId},{"Config",config},{"HostConfig",request["HostConfig"]!.DeepClone()},{"Mounts",new JsonArray(new JsonObject{{"Type","volume"},{"Name",MaterializationSpecification.VolumeName(i.Attempt)},{"Driver","local"},{"Source",Volume(i)["Mountpoint"]!.DeepClone()},{"Destination","/workspace/repo"},{"RW",true},{"Propagation",""}})},{"State",new JsonObject{{"Running",false},{"Status","created"},{"ExitCode",0},{"OOMKilled",false}}}};
 }
 internal static void RunSpec(Action<string,bool> check){
  var i=Identity();var mount=MaterializationSpecification.VerifyVolume(JsonSerializer.SerializeToElement(Volume(i)),i);
  var omitted=Container(i);omitted["Config"]!.AsObject().Remove("Cmd");check("omitted_empty_container_command",MaterializationSpecification.VerifyContainer(JsonSerializer.SerializeToElement(omitted),i,mount,null,true)==new string('d',64));
  var defaults=Container(i);defaults["HostConfig"]!["Mounts"]![0]!.AsObject().Remove("ReadOnly");defaults["HostConfig"]!["Mounts"]![0]!["VolumeOptions"]!.AsObject().Remove("NoCopy");check("documented_omitted_false_mount_defaults",MaterializationSpecification.VerifyContainer(JsonSerializer.SerializeToElement(defaults),i,mount,null,true)==new string('d',64));
  var root=Container(i);check("fixed_node_spec_owned_volume",MaterializationSpecification.VerifyContainer(JsonSerializer.SerializeToElement(root),i,mount,null,true)==new string('d',64));
  check("node_limits_no_health_profile_change",root["HostConfig"]!["Memory"]!.GetValue<long>()==536870912&&root["HostConfig"]!["NanoCpus"]!.GetValue<long>()==1000000000&&root["Config"]!["User"]!.GetValue<string>()=="10001:10001");
  foreach(var mode in new[]{"driver","options","foreign","scope","mountpoint"}){
   var bad=Volume(i);if(mode=="driver")bad["Driver"]="foreign";if(mode=="options")bad["Options"]=new JsonObject{{"device","/"}};if(mode=="foreign")bad["Labels"]!["omnira.sdf.materialization.bindingHash"]=new string('f',64);if(mode=="scope")bad["Scope"]="global";if(mode=="mountpoint")bad["Mountpoint"]="/wrong";
   check("volume_refused_"+mode,PathProcessSmoke.Refused(()=>MaterializationSpecification.VerifyVolume(JsonSerializer.SerializeToElement(bad),i)));
  }
  foreach(var mode in new[]{"root","network","readonly","mount","bind","caps","foreign","image","env","nocopy","memory","entrypoint","source","subpath","driver-options"}){
   var bad=Container(i);if(mode=="root")bad["Config"]!["User"]="0";if(mode=="network")bad["HostConfig"]!["NetworkMode"]="bridge";if(mode=="readonly")bad["HostConfig"]!["ReadonlyRootfs"]=false;if(mode=="mount")bad["Mounts"]![0]!["RW"]=false;if(mode=="bind")bad["HostConfig"]!["Binds"]=new JsonArray("/host:/workspace/repo");if(mode=="caps")bad["HostConfig"]!["CapAdd"]=new JsonArray("SYS_ADMIN");if(mode=="foreign")bad["Config"]!["Labels"]!["omnira.sdf.materialization.attemptId"]=Guid.NewGuid().ToString();if(mode=="image")bad["Image"]="sha256:"+new string('f',64);if(mode=="env")bad["Config"]!["Env"]!.AsArray().Add("SECRET=unexpected");if(mode=="nocopy")bad["HostConfig"]!["Mounts"]![0]!["VolumeOptions"]!["NoCopy"]=true;if(mode=="memory")bad["HostConfig"]!["Memory"]=0;if(mode=="entrypoint")bad["Config"]!["Entrypoint"]=new JsonArray("/bin/sh");if(mode=="source")bad["Mounts"]![0]!["Source"]="/wrong";if(mode=="subpath")bad["HostConfig"]!["Mounts"]![0]!["VolumeOptions"]!["Subpath"]="other";if(mode=="driver-options")bad["HostConfig"]!["Mounts"]![0]!["VolumeOptions"]!["DriverConfig"]=new JsonObject{{"Name","foreign"}};
   check("node_protection_refused_"+mode,PathProcessSmoke.Refused(()=>MaterializationSpecification.VerifyContainer(JsonSerializer.SerializeToElement(bad),i,mount,null,true)));
  }
  check("binding_change_refuses_volume",PathProcessSmoke.Refused(()=>MaterializationSpecification.VerifyVolume(JsonSerializer.SerializeToElement(Volume(i)),i with{Binding=Binding with{Fence=2}})));
 }
}
