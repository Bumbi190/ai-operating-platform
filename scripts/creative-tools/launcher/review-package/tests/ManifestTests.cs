using System;
using System.Collections.Generic;
using System.Text;
using System.Reflection;
namespace Omnira.Creative.Review {
 internal static class ManifestTests {
  internal static int Assertions;
  static readonly UTF8Encoding Utf8=new UTF8Encoding(false,true);
  static void Check(bool b,string label){Assertions++;if(!b)throw new Exception(label);}
  static string Hex(char c,int n){return new string(c,n);}
  internal static Manifest Sample(){
   var map=new Dictionary<string,string>(StringComparer.Ordinal);
   foreach(string key in ManifestSchema.SourceKeys)map.Add(key,Hex('a',64));
   return new Manifest(Hex('b',32),Hex('c',40),1,Hex('d',64),ManifestSchema.RuntimePin,Hex('e',64),"4.8.9232.0",map);
  }
  static string Canonical(){return Utf8.GetString(PackageManifest.Encode(Sample()));}
  static void Reject(byte[] b,string label){bool rejected=false;try{PackageManifest.Parse(b);}catch(ReviewRefusal){rejected=true;}Check(rejected,label);}
  static void Reject(string s,string label){Reject(Utf8.GetBytes(s),label);}
  static string Host(string value){return Canonical().Replace("\"HostLength\":1,","\"HostLength\":"+value+",");}
  internal static void Run(){
   ValidCanonicalRoundTrip();Utf8BomSurrogates();DuplicateEscapedAliases();UnknownMissingFields();CountLexemes();DepthPropertyBounds();FixedSourceKeysAndPins();AuthorityCannotGrant();CoherentForeignDataIsNotAuthority();
  }
  static void ValidCanonicalRoundTrip(){
   byte[] b=PackageManifest.Encode(Sample());Manifest m=PackageManifest.Parse(b);
   Check(Convert.ToBase64String(b)==Convert.ToBase64String(PackageManifest.Encode(m)),"canonical round trip");
   Check(b[0]==123&&b[b.Length-1]==125,"no BOM/newline");
   Check(PackageManifest.Parse(Utf8.GetBytes(" \r\n"+Canonical())).HostLength==1,"leading whitespace");
   Check(PackageManifest.Parse(Utf8.GetBytes(Host("1048576"))).HostLength==1048576,"max metadata");
   var copy=new Dictionary<string,string>(StringComparer.Ordinal);foreach(string k in ManifestSchema.SourceKeys)copy[k]=Hex('a',64);
   var immutable=new Manifest(Hex('b',32),Hex('c',40),1,Hex('d',64),ManifestSchema.RuntimePin,Hex('e',64),"4.8",copy);
   copy[ManifestSchema.SourceKeys[0]]=Hex('f',64);Check(immutable.SourceDigests[ManifestSchema.SourceKeys[0]]==Hex('a',64),"map copied");
  }
  static void Utf8BomSurrogates(){
   byte[] b=PackageManifest.Encode(Sample()),bom=new byte[b.Length+3];bom[0]=239;bom[1]=187;bom[2]=191;Buffer.BlockCopy(b,0,bom,3,b.Length);Reject(bom,"BOM");
   Reject(new byte[]{123,34,255,34,58,48,125},"malformed UTF8");
   Reject(Canonical().Replace(Hex('b',32),"\\uD800"),"lone high escape");Reject(Canonical().Replace(Hex('b',32),"\\uDC00"),"lone low escape");
   Reject(Canonical().Replace(Hex('b',32),"\\uD800\\uDC00"),"pair invalid nonce");
  }
  static void DuplicateEscapedAliases(){
   Reject(Canonical().Replace("\"Nonce\":","\"N\\u006fnce\":\""+Hex('b',32)+"\",\"Nonce\":"),"escaped root duplicate");
   string k=ManifestSchema.SourceKeys[0];
   Reject(Canonical().Replace("\""+k+"\":","\""+k+"\":\""+Hex('a',64)+"\",\""+k.Replace("C","\\u0043")+"\":"),"source duplicate alias");
  }
  static void UnknownMissingFields(){
   Reject(Canonical().Replace("\"Schema\":","\"Unknown\":false,\"Schema\":"),"unknown root");
   Reject(Canonical().Replace("\"WorkerActivated\":false","\"Other\":false"),"missing field");
   Reject(Canonical()+" ","trailing whitespace");Reject(Canonical()+"{}","trailing object");
   Reject(new byte[65537],"oversize");Reject((byte[])null,"null");
  }
  static void CountLexemes(){
   foreach(string s in new[]{"0","1048577","-1","1.0","1e0","01","\"1\"","9223372036854775808","+1","null","true"})Reject(Host(s),"HostLength "+s);
  }
  static void DepthPropertyBounds(){
   Reject(Canonical().Replace("\"WorkerActivated\":false","\"WorkerActivated\":{\"a\":{\"b\":{}}}"),"depth four");
   var b=new StringBuilder("{");for(int i=0;i<65;i++){if(i>0)b.Append(',');b.Append("\"p"+i+"\":false");}b.Append('}');Reject(b.ToString(),"property 65");
  }
  static void FixedSourceKeysAndPins(){
   string c=Canonical();Reject(c.Replace(ManifestSchema.RuntimePin,Hex('f',64)),"runtime pin");
   Reject(c.Replace(Hex('c',40),Hex('C',40)),"commit");Reject(c.Replace(Hex('d',64),Hex('D',64)),"hash");
   Reject(c.Replace("\"CompilerVersion\":\"4.8.9232.0\"","\"CompilerVersion\":\"4.x\""),"compiler version");
   Reject(c.Replace(ManifestSchema.SourceKeys[0],"untrusted-path"),"unknown source");
   Check(ManifestSchema.SourceKeys.Length==17,"17 source keys");
  }
  static void AuthorityCannotGrant(){
   string c=Canonical();foreach(string name in ManifestSchema.AuthorityNames)Reject(c.Replace("\""+name+"\":false","\""+name+"\":true"),name);
   Reject(c.Replace("\"InstallationAuthorized\":false","\"InstallationAuthorized\":true"),"install");
   Reject(c.Replace("\"WorkerActivated\":false","\"WorkerActivated\":true"),"worker");
   Check(!Sample().Authorities.ProductionReady&&!Sample().InstallationAuthorized&&!Sample().WorkerActivated,"false grants");
   foreach(FieldInfo f in typeof(AuthorityObservation).GetFields(BindingFlags.Instance|BindingFlags.NonPublic|BindingFlags.Public))Check(f.IsInitOnly&&!(bool)f.GetValue(Sample().Authorities),"readonly false "+f.Name);
  }
  static void CoherentForeignDataIsNotAuthority(){
   string c=Canonical().Replace(Hex('d',64),Hex('f',64)).Replace(Hex('c',40),Hex('a',40));
   Manifest forged=PackageManifest.Parse(Utf8.GetBytes(c));Check(forged.HostSha256==Hex('f',64)&&!forged.Authorities.RealHumanApprovalVerified&&!forged.Authorities.GeneralExecutableTrustVerified,"coherent foreign data only");
  }
 }
}
