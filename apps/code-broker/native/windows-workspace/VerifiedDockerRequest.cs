using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
namespace Omnira.CodeBroker.Workspace;
/** Opaque requests: callers choose a closed operation, never an HTTP verb/route/body. */
internal sealed class VerifiedDockerRequest {
 internal HttpMethod Method{get;}internal string Route{get;}internal byte[]? Content{get;}internal string? ContentType{get;}internal int TimeoutMs{get;}
 VerifiedDockerRequest(HttpMethod method,string route,object? json,int timeout,byte[]? archive=null){Method=method;Route=route;TimeoutMs=timeout;Content=archive??(json==null?null:JsonSerializer.SerializeToUtf8Bytes(json));ContentType=archive!=null?"application/x-tar":json!=null?"application/json":null;}
 internal static VerifiedDockerRequest Version()=>new(HttpMethod.Get,"/version",null,5000);
 internal static VerifiedDockerRequest Info()=>new(HttpMethod.Get,"/v1.51/info",null,5000);
 internal static VerifiedDockerRequest HealthImage()=>new(HttpMethod.Get,"/v1.51/images/"+Uri.EscapeDataString(WindowsSandboxProbe.ImageReference)+"/json",null,5000);
 internal static VerifiedDockerRequest NodeImage(NodeToolchainProfile p){ToolchainProfile.RequireReady(p);return new(HttpMethod.Get,"/v1.51/images/"+Uri.EscapeDataString(p.ImageId)+"/json",null,5000);}
 internal static VerifiedDockerRequest HealthCreate(Guid a,string image)=>new(HttpMethod.Post,"/v1.51/containers/create?name="+ProbeSpecification.Name(a),ProbeSpecification.Create(a,image),5000);
 internal static VerifiedDockerRequest NodeCreate(MaterializationIdentity i)=>new(HttpMethod.Post,"/v1.51/containers/create?name="+MaterializationSpecification.ContainerName(i.Attempt),MaterializationSpecification.CreateContainer(i),5000);
 internal static VerifiedDockerRequest ContainerInspect(string owned){if(!ProbeSpecification.ContainerId(owned)&&!ProbeSpecification.IsName(owned)&&!Regex.IsMatch(owned,@"^omnira-sdf-node-[a-f0-9]{32}$"))throw new WorkspaceException("protocol_invalid");return new(HttpMethod.Get,"/v1.51/containers/"+owned+"/json",null,5000);}
 static void Id(string id){if(!ProbeSpecification.ContainerId(id))throw new WorkspaceException("protocol_invalid");}
 internal static VerifiedDockerRequest Start(string id){Id(id);return new(HttpMethod.Post,"/v1.51/containers/"+id+"/start",null,5000);}
 internal static VerifiedDockerRequest Wait(string id,bool fixture=false){Id(id);return new(HttpMethod.Post,"/v1.51/containers/"+id+"/wait?condition=not-running",null,fixture?90000:10000);}
 internal static VerifiedDockerRequest Logs(string id){Id(id);return new(HttpMethod.Get,"/v1.51/containers/"+id+"/logs?stdout=1&stderr=1&timestamps=0&follow=0",null,5000);}
 internal static VerifiedDockerRequest DeleteContainer(string id){Id(id);return new(HttpMethod.Delete,"/v1.51/containers/"+id+"?force=1",null,5000);}
 internal static VerifiedDockerRequest VolumeCreate(MaterializationIdentity i)=>new(HttpMethod.Post,"/v1.51/volumes/create",MaterializationSpecification.CreateVolume(i),5000);
 static void Attempt(Guid a){if(!WorkspaceJson.Uuid(a.ToString(),true))throw new WorkspaceException("input_invalid");}
 internal static VerifiedDockerRequest VolumeInspect(Guid a){Attempt(a);return new(HttpMethod.Get,"/v1.51/volumes/"+MaterializationSpecification.VolumeName(a),null,5000);}
 internal static VerifiedDockerRequest DeleteVolume(Guid a){Attempt(a);return new(HttpMethod.Delete,"/v1.51/volumes/"+MaterializationSpecification.VolumeName(a)+"?force=0",null,5000);}
 internal static VerifiedDockerRequest Archive(string id,byte[] tar){Id(id);if(tar.Length<1024||tar.Length>SourceFixturePolicy.MaxTarBytes)throw new WorkspaceException("archive_invalid");return new(HttpMethod.Put,"/v1.51/containers/"+id+"/archive?path=%2Fworkspace%2Frepo&noOverwriteDirNonDir=1&copyUIDGID=1",null,15000,tar.ToArray());}
}
