namespace Omnira.CodeBroker.Host;
public static class HostPolicy {
    private const uint FullMutation=2|4|16|64|256|0x10000|0x40000|0x80000;
    private const uint AncestorMutation=16|64|256|0x10000|0x40000|0x80000;
    private const uint KnownFileRights=0x001f01ff;
    private static uint Expand(uint mask) {
        uint result=mask&0x0fffffff;
        if((mask&0x80000000)!=0)result|=0x00120089;
        if((mask&0x40000000)!=0)result|=0x00120116;
        if((mask&0x20000000)!=0)result|=0x001200a0;
        if((mask&0x10000000)!=0)result|=KnownFileRights;
        return result;
    }
    public static bool TrustedSid(string sid,string userSid)=>sid==userSid||sid=="S-1-5-18"||sid=="S-1-5-32-544"||
        sid=="S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464";
    public static ObjectDecision Evaluate(TargetEvidence evidence,TargetDefinition expected,string userSid) {
        var reasons=new HashSet<string>(StringComparer.Ordinal);
        var components=evidence.Components;
        if(evidence.TargetId!=expected.Id||components.Length<2)reasons.Add("path_alias");
        var expectedPath=Path.GetFullPath(expected.Path);
        if(components.Length>0 && (!string.Equals(components[^1].CanonicalPath,expectedPath,StringComparison.OrdinalIgnoreCase)||components[^1].IsDirectory!=expected.IsDirectory))reasons.Add("path_alias");
        for(int i=0;i<components.Length;i++) {
            var c=components[i];
            if(i>0 && !string.Equals((Path.GetDirectoryName(c.CanonicalPath.TrimEnd('\\'))??"").TrimEnd('\\'),components[i-1].CanonicalPath.TrimEnd('\\'),StringComparison.OrdinalIgnoreCase))
                reasons.Add("path_alias");
            if(i<components.Length-1&&!c.IsDirectory)reasons.Add("path_alias");
            if(c.IsReparsePoint)reasons.Add("reparse_point");
            if(c.CaseSensitiveDirectory)reasons.Add("case_sensitive_directory");
            if(!TrustedSid(c.OwnerSid,userSid))reasons.Add("owner_untrusted");
            if(c.Aces==null){reasons.Add("acl_unproven");continue;}
            foreach(var ace in c.Aces) {
                if(ace.Kind!="allow"&&ace.Kind!="deny"){reasons.Add("acl_unproven");continue;}
                if(ace.InheritOnly||ace.Kind=="deny")continue;
                var mask=Expand(ace.Mask);
                if((mask&~KnownFileRights)!=0){reasons.Add("acl_unproven");continue;}
                var forbidden=i>=components.Length-2?FullMutation:AncestorMutation;
                if(!TrustedSid(ace.Sid,userSid)&&(mask&forbidden)!=0)reasons.Add("acl_writable");
            }
        }
        if(expected.PinnedSha256!=null&&evidence.Sha256!=expected.PinnedSha256)reasons.Add("hash_changed");
        return new(reasons.Count==0,reasons.Order().ToArray());
    }
}
