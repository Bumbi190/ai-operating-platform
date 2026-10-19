namespace Omnira.CodeBroker.Workspace;
public sealed class WorkspaceException:Exception {
 public string Reason{get;}
 public WorkspaceException(string reason):base("Windows workspace operation refused"){Reason=reason;}
}
internal sealed record GitProcessResult(int? ExitCode,string Stdout,bool TimedOut,bool OutputLimit);
