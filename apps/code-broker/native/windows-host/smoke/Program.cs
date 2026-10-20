using System.Security.AccessControl;
using System.Security.Principal;
using System.Security.Cryptography;
using System.Text.Json;
using Omnira.CodeBroker.Host;

var names=new List<string>();
void Check(string name,bool value){if(!value)throw new Exception(name);names.Add(name);}
var user=WindowsIdentity.GetCurrent().User!.Value;
const string foreign="S-1-1-0";
var hash=new string('a',64);
ComponentEvidence C(string path,bool directory,AceEvidence[]? aces=null,string? owner=null) =>
    new(path,new string('b',64),owner??user,aces??new[]{new AceEvidence("allow",user,0x1f01ff,false)},directory,false,false);
var expected=new TargetDefinition("fixture","C:/fixture/tools/one.exe",false,hash);
var good=new TargetEvidence("fixture",new[]{C("C:\\",true),C("C:\\fixture",true),C("C:\\fixture\\tools",true),C("C:\\fixture\\tools\\one.exe",false)},hash);
ObjectDecision Eval(TargetEvidence e)=>HostPolicy.Evaluate(e,expected,user);
Check("valid_fixed_target",Eval(good).Allowed);
Check("changed_hash_refused",!Eval(good with{Sha256=new string('c',64)}).Allowed);
Check("foreign_owner_refused",!Eval(good with{Components=good.Components.Select((c,i)=>i==3?c with{OwnerSid=foreign}:c).ToArray()}).Allowed);
Check("null_acl_refused",!Eval(good with{Components=good.Components.Select((c,i)=>i==3?c with{Aces=null}:c).ToArray()}).Allowed);
Check("unknown_ace_refused",!Eval(good with{Components=good.Components.Select((c,i)=>i==3?c with{Aces=new[]{new AceEvidence("callback",user,0,false)}}:c).ToArray()}).Allowed);
foreach(uint mask in new uint[]{2,4,16,256,65536,262144,524288,0x40000000,0x10000000}){
  var bad=good with{Components=good.Components.Select((c,i)=>i==3?c with{Aces=new[]{new AceEvidence("allow",foreign,mask,false)}}:c).ToArray()};
  Check("leaf_untrusted_mask_"+mask,!Eval(bad).Allowed);
}
foreach(uint mask in new uint[]{2,4,16,64,256,65536,262144,524288}){
  var bad=good with{Components=good.Components.Select((c,i)=>i==2?c with{Aces=new[]{new AceEvidence("allow",foreign,mask,false)}}:c).ToArray()};
  Check("parent_untrusted_mask_"+mask,!Eval(bad).Allowed);
}
Check("ancestor_create_only_allowed",Eval(good with{Components=good.Components.Select((c,i)=>i==0?c with{Aces=new[]{new AceEvidence("allow",foreign,6,false)}}:c).ToArray()}).Allowed);
Check("ancestor_deletechild_refused",!Eval(good with{Components=good.Components.Select((c,i)=>i==0?c with{Aces=new[]{new AceEvidence("allow",foreign,64,false)}}:c).ToArray()}).Allowed);
Check("inherit_only_not_applied",Eval(good with{Components=good.Components.Select((c,i)=>i==3?c with{Aces=new[]{new AceEvidence("allow",foreign,0x10000000,true)}}:c).ToArray()}).Allowed);
Check("deny_does_not_cancel_unsafe_allow",!Eval(good with{Components=good.Components.Select((c,i)=>i==3?c with{Aces=new[]{new AceEvidence("deny",foreign,2,false),new AceEvidence("allow",foreign,2,false)}}:c).ToArray()}).Allowed);
Check("reparse_refused",!Eval(good with{Components=good.Components.Select((c,i)=>i==1?c with{IsReparsePoint=true}:c).ToArray()}).Allowed);
Check("case_sensitive_refused",!Eval(good with{Components=good.Components.Select((c,i)=>i==1?c with{CaseSensitiveDirectory=true}:c).ToArray()}).Allowed);

var folder=Path.Combine(Path.Combine(Environment.CurrentDirectory,".superpowers","sdd","2026-10-18-windows-host-qualification"),"omnira-host-fixture-"+Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(folder);
var file=Path.Combine(folder,"file with spaces.txt");
File.WriteAllText(file,"owned fixture");
var target=new TargetDefinition("fixture",file,false,Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(file))).ToLowerInvariant());
try {
  var evidence=NativeFileEvidence.Inspect(target);
  Check("native_space_path_accepted",HostPolicy.Evaluate(evidence,target,user).Allowed);
  var junction=Path.Combine(folder,"junction");var destination=Path.Combine(folder,"destination");Directory.CreateDirectory(destination);
  try {
    Omnira.CodeBroker.Host.Smoke.FixtureJunction.Create(junction,destination);
    bool refused=false;try{NativeFileEvidence.Inspect(new("fixture",junction,true,null));}catch(HostCheckException e){refused=e.Reason=="reparse_point";}
    Check("native_junction_refused",refused);
  } finally {if(Directory.Exists(junction))Directory.Delete(junction);}
  var acl=FileSystemAclExtensions.GetAccessControl(new FileInfo(file));
  acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(foreign),FileSystemRights.WriteData,AccessControlType.Allow));
  FileSystemAclExtensions.SetAccessControl(new FileInfo(file),acl);
  Check("native_unsafe_acl_refused",!HostPolicy.Evaluate(NativeFileEvidence.Inspect(target),target,user).Allowed);
  foreach(var bad in new[]{"C:/fixture/../file","C:/fixture/file:stream","\\\\server\\share\\file","\\\\?\\C:\\file","C:/fixture/trailing. ","C:/PROGRA~1/file"}){
    bool refused=false;try{NativeFileEvidence.Inspect(new("fixture",bad,false,null));}catch{refused=true;}
    Check("alias_input_refused_"+names.Count,refused);
  }
} finally { Directory.Delete(folder,true); }
Check("fixture_removed",!Directory.Exists(folder));
await Omnira.CodeBroker.Host.Smoke.DockerSmokeTests.Run(Check);
Console.WriteLine(JsonSerializer.Serialize(new{passed=names.Count,names}));
