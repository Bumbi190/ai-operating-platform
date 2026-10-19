namespace Omnira.CodeBroker.Host;
public sealed record TargetDefinition(string Id,string Path,bool IsDirectory,string? PinnedSha256);
public sealed record AceEvidence(string Kind,string Sid,uint Mask,bool InheritOnly);
public sealed record ComponentEvidence(string CanonicalPath,string FileIdHash,string OwnerSid,AceEvidence[]? Aces,bool IsDirectory,bool IsReparsePoint,bool CaseSensitiveDirectory);
public sealed record TargetEvidence(string TargetId,ComponentEvidence[] Components,string? Sha256);
public sealed record ObjectDecision(bool Allowed,string[] Reasons);
public sealed class HostCheckException : Exception {
    public string Reason {get;}
    public HostCheckException(string reason):base("host observation unavailable"){Reason=reason;}
}
public static class HostProfile {
    public const string Id="andre_desktop_windows_v1";
    public const string Schema="sdf.windows_host_qualification.v1";
    public static readonly IReadOnlyList<TargetDefinition> Targets=Array.AsReadOnly(new[]{
        new TargetDefinition("git","C:/Program Files/Git/cmd/git.exe",false,"bd1bf0469426e2e67a27300176303b5e43e1dda81babc1c24c9c2ce627b97960"),
        new TargetDefinition("docker","C:/Program Files/Docker/Docker/resources/bin/docker.exe",false,"6c699720bb9523dedb9eb5d22a49951ea9210dbdb1314a3554029eee9be76896"),
        new TargetDefinition("backend","C:/Program Files/Docker/Docker/resources/com.docker.backend.exe",false,"37deeeae5bf632014b22fc6487cb9a531072f8d32d062acf6982a914fa6e8585"),
        new TargetDefinition("dotnet","C:/Program Files/dotnet/dotnet.exe",false,"7967467e8bad9c686de2ab2c1994112d5331a7c3d20f0b8a4fff7480221a1c37"),
        new TargetDefinition("checkout","C:/Users/Andre/Projects/Omnira/Code/ai-operating-platform",true,null),
        new TargetDefinition("worktree_parent","C:/Users/Andre/Projects/Omnira/.worktrees",true,null),
    });
    public static readonly IReadOnlyList<string> Reasons=Array.AsReadOnly(new[]{
        "unsupported_platform","missing_target","unreadable_target","path_alias","reparse_point","case_sensitive_directory",
        "owner_untrusted","acl_unproven","acl_writable","hash_changed","pipe_unavailable","peer_unproven","peer_changed",
        "docker_unavailable","docker_metadata_invalid","response_too_large","deadline_exceeded","helper_unavailable","helper_failed","invalid_report",
    });
}
