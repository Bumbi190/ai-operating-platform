using System.Text.Json;
using Omnira.CodeBroker.Host;
namespace Omnira.CodeBroker.Workspace.Smoke;
internal static class RealMaterializationSmoke {
 internal static async Task Run(bool create){
  var input=await Console.In.ReadToEndAsync();if(input.Length>4096)throw new Exception("input bound");
  var (r,a)=MaterializationContracts.Parse(input,false);using var deadline=new CancellationTokenSource(150000);
  if(!await new NativeHostPreflight().IsQualifiedAsync(deadline.Token))throw new Exception("host unqualified");
  using var lease=await WindowsWorkspaceLease.OpenExistingAsync(r,deadline.Token);var snapshot=await SourceSnapshot.BuildAsync(lease,deadline.Token);
  if(!create){Console.WriteLine(JsonSerializer.Serialize(new{manifest=JsonSerializer.Deserialize<JsonElement>(snapshot.ManifestBytes),manifestSha256=snapshot.ManifestSha256,productionAuthority=false}));return;}
  var journal=new MaterializationAttemptJournal(Path.Combine(Environment.CurrentDirectory,"apps/code-broker/.native/windows-workspace/attempts"));using var guard=new MaterializationAttemptGuard(a);using var record=journal.Begin(r,a,false);
  var p=ToolchainProfile.RequireReady(ToolchainProfile.Current);foreach(var pin in ToolchainProfile.DescriptorPins)if(snapshot.Files.SingleOrDefault(f=>f.Path==pin.Key)?.Sha256!=pin.Value)throw new Exception("descriptor mismatch");
  var i=new MaterializationIdentity(a,snapshot.Binding,snapshot.ManifestSha256,p);var session=new DockerMaterializationSession(new NativeDockerPeerConnector());await session.InitializeAsync(deadline.Token);await session.ImageAsync(p,deadline.Token);
  using(var volume=await session.VolumeAsync(a,deadline.Token))if(volume!=null)throw new Exception("existing volume");
  using(var container=await session.ContainerAsync(MaterializationSpecification.ContainerName(a),deadline.Token))if(container!=null)throw new Exception("existing container");
  journal.BindPeer(r,a,new(session.BackendIdentityHash!,session.DaemonIdentityHash!,i.ProfileHash,i.ManifestSha256));
  await session.CreateVolumeAsync(i,deadline.Token);string mount;
  using(var volume=await session.VolumeAsync(a,deadline.Token)){if(volume==null)throw new Exception("missing volume");mount=MaterializationSpecification.VerifyVolume(volume.RootElement,i);}
  var id=await session.CreateContainerAsync(i,deadline.Token);
  using var inspect=await session.ContainerAsync(id,deadline.Token);if(inspect==null)throw new Exception("missing container");MaterializationSpecification.VerifyContainer(inspect.RootElement,i,mount,id,true);
  await lease.ValidateUnchangedAsync(deadline.Token);
  Console.WriteLine(JsonSerializer.Serialize(new{attemptId=a.ToString(),containerId=id,volumeName=MaterializationSpecification.VolumeName(a),manifestSha256=i.ManifestSha256,imageId=p.ImageId,toolchainProfileHash=i.ProfileHash,backendIdentityHash=session.BackendIdentityHash,daemonIdentityHash=session.DaemonIdentityHash,state="created",inspect=inspect.RootElement,productionAuthority=false}));
 }
}