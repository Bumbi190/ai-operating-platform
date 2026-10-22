using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
namespace Omnira.CodeBroker.Workspace;
// Bounded detector families, not a language parser or an exhaustive secret detector.
internal static class SecretTextPolicy {
 static readonly TimeSpan Budget=TimeSpan.FromSeconds(1);
 static readonly Regex Assignment=new("""(?i:(?<![A-Za-z0-9_$])["']?(?:api_key|apiKey|secret_access_key|password|private_key)["']?)\s*[:=]\s*["']""",RegexOptions.CultureInvariant,Budget);
 static readonly string[] Tokens={@"-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----",@"(?:sk-proj-|sk-ant-|sk-)[A-Za-z0-9_-]{20,}",@"(?:AKIA|ASIA)[A-Z0-9]{16}"};
 internal static bool Contains(string text)=>Tokens.Any(p=>Regex.IsMatch(text,p,RegexOptions.CultureInvariant,Budget))||Assignments(text).Any();
 static IEnumerable<(int Start,int Length)> Assignments(string text){
  for(var match=Assignment.Match(text);match.Success;){
   int at=match.Index+match.Length,count=0;char quote=text[at-1];
   while(at<text.Length&&text[at] is not ('\r' or '\n')){
    char c=text[at++];if(c==quote)break;
    if(c=='\\'&&at<text.Length&&text[at] is not ('\r' or '\n')){
     char escape=text[at++];int digits=escape=='x'?2:escape=='u'?4:0;
     if(escape=='u'&&at<text.Length&&text[at]=='{'){
      int close=text.IndexOf('}',at+1);
      if(close>at+1&&close-at<=7&&int.TryParse(text.AsSpan(at+1,close-at-1),NumberStyles.AllowHexSpecifier,CultureInfo.InvariantCulture,out var scalar)&&scalar<=0x10ffff&&scalar is not (>=0xd800 and <=0xdfff)){at=close+1;count+=scalar>0xffff?2:1;continue;}
     }
     if(digits>0&&at+digits<=text.Length&&int.TryParse(text.AsSpan(at,digits),NumberStyles.AllowHexSpecifier,CultureInfo.InvariantCulture,out _))at+=digits;
    }
    count++;
   }
   // An unterminated same-line value is also withheld once it reaches the bound.
   if(count>=20)yield return(match.Index,at-match.Index);
   match=Assignment.Match(text,at);
  }
 }
 internal static string Redact(string text){
  var result=new StringBuilder();int at=0;
  foreach(var hit in Assignments(text)){result.Append(text,at,hit.Start-at);result.Append("[redacted-assignment]");at=hit.Start+hit.Length;}
  result.Append(text,at,text.Length-at);var safe=result.ToString();
  safe=Regex.Replace(safe,@"-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)","[redacted-key]",RegexOptions.CultureInvariant,Budget);
  safe=Regex.Replace(safe,Tokens[1],"[redacted-token]",RegexOptions.CultureInvariant,Budget);
  safe=Regex.Replace(safe,Tokens[2],"[redacted-access-key]",RegexOptions.CultureInvariant,Budget);
  return Regex.Replace(safe,@"[\x00-\x08\x0b\x0c\x0e-\x1f]","",RegexOptions.CultureInvariant,Budget);
 }
 internal static string Diagnostic(string text){
  // Decode JSON strings before scanning: raw JSON escaping must not hide log assignments.
  // Malformed/multiple JSON output is withheld rather than persisted verbatim.
  try{
   using var doc=JsonDocument.Parse(text,new JsonDocumentOptions{MaxDepth=16});WorkspaceJson.Unique(doc.RootElement);
   using var bytes=new MemoryStream();using(var writer=new Utf8JsonWriter(bytes))Write(doc.RootElement,writer);
   return Encoding.UTF8.GetString(bytes.ToArray());
  }catch{return "[diagnostic-unavailable]";}
 }
 static void Write(JsonElement value,Utf8JsonWriter writer){
  switch(value.ValueKind){
   case JsonValueKind.Object:writer.WriteStartObject();foreach(var p in value.EnumerateObject()){writer.WritePropertyName(Redact(p.Name));Write(p.Value,writer);}writer.WriteEndObject();break;
   case JsonValueKind.Array:writer.WriteStartArray();foreach(var item in value.EnumerateArray())Write(item,writer);writer.WriteEndArray();break;
   case JsonValueKind.String:writer.WriteStringValue(Redact(value.GetString()!));break;
   default:value.WriteTo(writer);break;
  }
 }
}
