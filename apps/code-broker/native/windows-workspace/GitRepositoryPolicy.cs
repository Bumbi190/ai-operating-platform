using System.Text.RegularExpressions;
namespace Omnira.CodeBroker.Workspace;
internal static class GitRepositoryPolicy {
 internal static string AuditConfig(string config){
  var trusted=false;
  foreach(var entry in config.Split('\0')){
   if(entry.Length==0)continue;int split=entry.IndexOf('\n');var key=split<0?entry:entry[..split];var value=split<0?"":entry[(split+1)..];
   if(!Regex.IsMatch(key,@"^[A-Za-z0-9][A-Za-z0-9.\-_/:@+ ]*$"))throw new WorkspaceException("unsafe_git_config");
   var lower=key.ToLowerInvariant();var parts=lower.Split('.');var section=parts[0];var variable=parts[^1];
   bool truth=Regex.IsMatch(value,@"^(?:true|yes|on|1)$",RegexOptions.IgnoreCase|RegexOptions.CultureInvariant);
   if((section=="filter"&&(variable is "clean" or "smudge" or "process")&&value!="")||
      (lower=="core.fsmonitor"&&value!=""&&!Regex.IsMatch(value,@"^(?:false|no|off|0)$",RegexOptions.IgnoreCase))||
      lower=="core.hookspath"||(section=="credential"&&variable=="helper"&&value!="")||
      ((lower is "core.sshcommand" or "core.askpass" or "core.gitproxy" or "core.pager" or "core.editor" or "sequence.editor")&&value!="")||
      (section is "include" or "includeif")||(section=="diff"&&(variable is "command" or "textconv")&&value!="")||
      (section=="merge"&&variable=="driver"&&value!="")||((section is "difftool" or "mergetool")&&variable=="cmd"&&value!="")||
      (section=="alias"&&value.TrimStart().StartsWith('!'))||(lower=="extensions.worktreeconfig"&&truth)||
      (lower=="core.worktree"&&value!="")||(lower=="core.bare"&&truth))throw new WorkspaceException("unsafe_git_config");
   if(section=="remote"&&parts.Length>=3&&(variable is "url" or "pushurl")){
    if(!MatchesRemote(value))throw new WorkspaceException("remote_identity_mismatch");
    if(key.Substring(7,key.Length-7-variable.Length-1)=="origin"&&variable=="url")trusted=true;
   }
  }
  if(!trusted)throw new WorkspaceException("remote_identity_mismatch");
  return Omnira.CodeBroker.Host.NativeFileEvidence.Hash("remote-identity:github:github.com/bumbi190/ai-operating-platform");
 }
 static bool MatchesRemote(string text){
  if(text.Trim()!=text||text.Contains('\0'))return false;
  var scp=Regex.Match(text,@"^git@github\.com:([^/]+)/([^/]+?)(?:\.git)?$",RegexOptions.IgnoreCase|RegexOptions.CultureInvariant);string owner,name;
  if(scp.Success){owner=scp.Groups[1].Value;name=scp.Groups[2].Value;}
  else{
   if(!Uri.TryCreate(text,UriKind.Absolute,out var uri)||(uri.Scheme is not ("https" or "ssh"))||!uri.Host.Equals("github.com",StringComparison.OrdinalIgnoreCase)||uri.Query!=""||uri.Fragment!=""||!uri.IsDefaultPort||(uri.UserInfo!=""&&uri.UserInfo!="git"))return false;
   var segments=uri.AbsolutePath.TrimStart('/').Split('/');if(segments.Length!=2)return false;
   owner=segments[0];name=Regex.Replace(segments[1],@"\.git$","",RegexOptions.IgnoreCase);
  }
  return owner.Equals("bumbi190",StringComparison.OrdinalIgnoreCase)&&name.Equals("ai-operating-platform",StringComparison.OrdinalIgnoreCase);
 }
}
