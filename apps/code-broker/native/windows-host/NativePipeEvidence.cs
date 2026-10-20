using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using Microsoft.Win32.SafeHandles;
namespace Omnira.CodeBroker.Host;

public sealed record PeerEvidence(int ProcessId,string ProcessIdentityHash,string ImagePath,string ImageHash,string UserSid);
public abstract class OwnedPipeObservation:IDisposable {
    public Stream Stream {get;}
    public PeerEvidence Peer {get;}
    protected OwnedPipeObservation(Stream stream,PeerEvidence peer){Stream=stream;Peer=peer;}
    public abstract void ValidatePeer();
    public abstract void Dispose();
}
public interface IDockerPeerConnector {Task<OwnedPipeObservation> ConnectAsync(CancellationToken cancellation);}
public sealed class NativeDockerPeerConnector:IDockerPeerConnector {
    public async Task<OwnedPipeObservation> ConnectAsync(CancellationToken cancellation) {
        var stream=new NamedPipeClientStream(".","dockerDesktopLinuxEngine",PipeDirection.InOut,PipeOptions.Asynchronous,TokenImpersonationLevel.Anonymous);
        try {
            using var timeout=CancellationTokenSource.CreateLinkedTokenSource(cancellation);timeout.CancelAfter(1500);
            await stream.ConnectAsync(timeout.Token);
            return NativePipeEvidence.Read(stream);
        } catch(HostCheckException){stream.Dispose();throw;}
        catch(OperationCanceledException){stream.Dispose();throw new HostCheckException("deadline_exceeded");}
        catch{stream.Dispose();throw new HostCheckException("pipe_unavailable");}
    }
}
public static class NativePipeEvidence {
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetNamedPipeServerProcessId(SafePipeHandle pipe,out uint id);
    [DllImport("kernel32.dll",SetLastError=true)] static extern SafeProcessHandle OpenProcess(uint access,bool inherit,uint id);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool QueryFullProcessImageNameW(SafeProcessHandle process,uint flags,StringBuilder name,ref uint length);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessTimes(SafeProcessHandle process,out long creation,out long exit,out long kernel,out long user);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetExitCodeProcess(SafeProcessHandle process,out uint code);
    [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(SafeProcessHandle process,uint access,out SafeAccessTokenHandle token);
    public static OwnedPipeObservation Read(NamedPipeClientStream stream) {
        SafeProcessHandle? process=null;
        try {
            if(!GetNamedPipeServerProcessId(stream.SafePipeHandle,out var pid)||pid==0)throw new HostCheckException("peer_unproven");
            process=OpenProcess(0x1000,false,pid);
            if(process.IsInvalid)throw new HostCheckException("peer_unproven");
            var name=new StringBuilder(4096);uint length=4096;
            if(!QueryFullProcessImageNameW(process,0,name,ref length))throw new HostCheckException("peer_unproven");
            var expected=HostProfile.Targets.Single(t=>t.Id=="backend");
            var actual=NativeFileEvidence.CanonicalInput(name.ToString());
            if(!string.Equals(actual,Path.GetFullPath(expected.Path),StringComparison.OrdinalIgnoreCase))throw new HostCheckException("peer_unproven");
            var user=WindowsIdentity.GetCurrent().User!.Value;
            if(!OpenProcessToken(process,8,out var token))throw new HostCheckException("peer_unproven");
            using(token)using(var identity=new WindowsIdentity(token.DangerousGetHandle())) {
                if(identity.User?.Value!=user)throw new HostCheckException("peer_unproven");
            }
            var file=NativeFileEvidence.Inspect(expected);
            if(!HostPolicy.Evaluate(file,expected,user).Allowed)throw new HostCheckException("peer_unproven");
            if(!GetProcessTimes(process,out var created,out _,out _,out _))throw new HostCheckException("peer_unproven");
            var peer=new PeerEvidence(checked((int)pid),NativeFileEvidence.Hash($"backend-v1:{pid}:{created}:{file.Components[^1].FileIdHash}:{file.Sha256}"),actual,file.Sha256!,user);
            var owned=new NativeOwnedPipe(stream,peer,process,created);
            owned.ValidatePeer();process=null;return owned;
        } catch(HostCheckException){throw;}
        catch{throw new HostCheckException("peer_unproven");}
        finally{process?.Dispose();}
    }
    sealed class NativeOwnedPipe:OwnedPipeObservation {
        readonly NamedPipeClientStream pipe;readonly SafeProcessHandle process;readonly long created;
        public NativeOwnedPipe(NamedPipeClientStream pipe,PeerEvidence peer,SafeProcessHandle process,long created):base(pipe,peer){this.pipe=pipe;this.process=process;this.created=created;}
        public override void ValidatePeer() {
            if(!GetNamedPipeServerProcessId(pipe.SafePipeHandle,out var pid)||pid!=Peer.ProcessId||
               !GetExitCodeProcess(process,out var code)||code!=259||
               !GetProcessTimes(process,out var now,out _,out _,out _)||now!=created)throw new HostCheckException("peer_changed");
        }
        public override void Dispose(){pipe.Dispose();process.Dispose();}
    }
}
