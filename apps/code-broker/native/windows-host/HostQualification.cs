using System.Globalization;
using System.Security.Principal;
using System.Text.Json;
namespace Omnira.CodeBroker.Host;

public sealed record TargetCheck(string Id,bool Ok,string? IdentityHash,string[] Reasons);
public sealed record DockerProjection(string BackendIdentityHash,string DaemonIdentityHash,string OsType,string Provider,string KernelFamily);
public sealed record HostQualificationReport(string Schema,string ProfileId,string Status,string ObservedAt,TargetCheck[] TargetChecks,DockerProjection? Docker,string[] Reasons);
public static class HostQualification {
    public static async Task<HostQualificationReport> EvaluateAsync(CancellationToken cancellation) {
        var checks=new List<TargetCheck>();var reasons=new HashSet<string>(StringComparer.Ordinal);
        var user=WindowsIdentity.GetCurrent().User!.Value;
        foreach(var target in HostProfile.Targets) {
            try {
                var evidence=NativeFileEvidence.Inspect(target);
                var decision=HostPolicy.Evaluate(evidence,target,user);
                foreach(var reason in decision.Reasons)reasons.Add(reason);
                checks.Add(new(target.Id,decision.Allowed,NativeFileEvidence.Hash("target-v1:"+JsonSerializer.Serialize(evidence)),decision.Reasons));
            } catch(HostCheckException e) {
                reasons.Add(e.Reason);checks.Add(new(target.Id,false,null,new[]{e.Reason}));
            } catch {
                reasons.Add("unreadable_target");checks.Add(new(target.Id,false,null,new[]{"unreadable_target"}));
            }
        }
        DockerProjection? docker=null;
        if(checks.Where(c=>c.Id is "dotnet" or "backend").All(c=>c.Ok)) {
            try {
                var evidence=await new DockerObservation().ObserveAsync(cancellation);
                docker=new(evidence.BackendIdentityHash,evidence.DaemonIdentityHash,evidence.OsType,"docker_desktop_wsl2","microsoft_wsl2");
            } catch(HostCheckException e){reasons.Add(e.Reason);}
            catch{reasons.Add("docker_unavailable");}
        }
        var qualified=checks.All(c=>c.Ok)&&docker!=null&&reasons.Count==0;
        return new(HostProfile.Schema,HostProfile.Id,qualified?"qualified_for_health_probe":"blocked",
            DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ",CultureInfo.InvariantCulture),checks.ToArray(),docker,reasons.Order().ToArray());
    }
}
