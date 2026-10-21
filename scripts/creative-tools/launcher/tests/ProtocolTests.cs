using System;
using System.Text;
using System.Security.Cryptography;
namespace Omnira.Creative.Synthetic {
 internal static class ProtocolTests {
  const string Nonce="0123456789abcdef0123456789abcdef";
  static readonly UTF8Encoding Utf8=new UTF8Encoding(false,true);
  static string Hash(byte[] bytes){using(SHA256 h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
  static CanaryInput Input(byte[] bytes){return new CanaryInput(bytes,Hash(bytes));}
  static RequestExpectation Expected(byte[] bytes){return new RequestExpectation(Nonce,bytes.Length,Hash(bytes));}
  static string Result(byte[] bytes){return "{\"nonce\":\""+Nonce+"\",\"byteCount\":"+bytes.Length+",\"sha256\":\""+Hash(bytes)+"\"}";}
  static string Request(string count,string data){return "{\"nonce\":\""+Nonce+"\",\"byteCount\":"+count+",\"bytesBase64\":\""+data+"\"}";}
  static OwnedFixture sharedFixture;
  internal static void Run(){
   try{using(OwnedFixture fixture=FixtureInput.CreateOwned()){
    sharedFixture=fixture;
    ExactRoundTripVectors();RejectMalformedProtocol();BoundBeforeAllocation();AuthoredPayloadOnly();
   }}finally{sharedFixture=null;}
   Assert.True(WindowsProcessBoundary.LastCleanup.Complete,"protocol fixture cleanup");
  }
  static ProtocolCapture Native(byte[] request,string payload){
   ProtocolCapture result;
   {
    ProtocolTestHooks.Payload=payload;
    try{using(BoundarySession s=WindowsProcessBoundary.CreateSuspended(sharedFixture,new OperationBudget())){
     s.VerifyBeforeResume();s.Resume();result=s.CanaryRoundTrip(request);
     Assert.True(s.ExactJobAtReturn&&s.TokenVerified,"actual native policy");
    }}finally{ProtocolTestHooks.Payload=null;}
   }
   Assert.True(sharedFixture.Cleanup.ProcessesStopped&&sharedFixture.Cleanup.PumpsStopped,"native producers stopped");
   return result;
  }
  static void ExactRoundTripVectors(){
   foreach(int size in new[]{0,1,65536}){
    byte[] bytes=new byte[size];for(int i=0;i<size;i++)bytes[i]=(byte)(i%251);
    byte[] encoded=SyntheticProtocol.EncodeRequest(Input(bytes),Nonce);
    Assert.True(encoded.Length<=98304,"encoded cap");
    ProtocolCapture result=Native(encoded,null);
    Assert.Equal<uint>(0,result.ExitCode);Assert.Equal<int>(0,result.Stderr.Length);
    SyntheticProtocol.VerifyResult(result.Stdout,Expected(bytes));
    Console.WriteLine("PASS ExactRoundTripVectors bytes="+size+" requestBytes="+encoded.Length+" resultBytes="+result.Stdout.Length+" sha256="+Hash(bytes)+" terminal=true");
   }
   // Independent known digests prevent a shared codec/hash bug from passing.
   Assert.Equal<string>("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",Hash(new byte[0]));
   Assert.Equal<string>("6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d",Hash(new byte[]{0}));
   string reordered="{ \"sha256\" : \""+Hash(new byte[0])+"\", \"byteCount\" : 0, \"\\u006eonce\" : \""+Nonce+"\"}";
   SyntheticProtocol.VerifyResult(Utf8.GetBytes(reordered),Expected(new byte[0]));
   ProtocolCapture escaped=Native(Utf8.GetBytes("{\"bytesBase64\":\"\\u0041A==\",\"byteCount\":1,\"\\u006eonce\":\""+Nonce+"\"}"),null);
   Assert.Equal<uint>(0,escaped.ExitCode);SyntheticProtocol.VerifyResult(escaped.Stdout,Expected(new byte[]{0}));
  }
  static void RejectMalformedProtocol(){
   byte[] empty=new byte[0];string valid=Result(empty);
   string[] badResults={
    valid+" ",valid+"\n",valid+"{}",valid+"x","\ufeff"+valid,
    valid.Replace("\"byteCount\":0","\"byteCount\":0,\"byteCount\":0"),
    valid.Replace("\"byteCount\":0","\"byteCount\":0,\"\\u0062yteCount\":0"),
    valid.Replace("\"byteCount\":0","\"extra\":0"),valid.Replace(",\"byteCount\":0",""),
    valid.Replace("\"byteCount\":0","\"byteCount\":{}"),valid.Replace("\"byteCount\":0","\"byteCount\":[]"),
    valid.Replace("\"byteCount\":0","\"byteCount\":1"),
    valid.Replace("\"byteCount\":0","\"byteCount\":-1"),valid.Replace("\"byteCount\":0","\"byteCount\":65537"),
    valid.Replace("\"byteCount\":0","\"byteCount\":0.0"),valid.Replace("\"byteCount\":0","\"byteCount\":0e0"),
    valid.Replace("\"byteCount\":0","\"byteCount\":\"0\""),valid.Replace("\"byteCount\":0","\"byteCount\":00"),
    valid.Replace(Nonce,new string('0',32)),valid.Replace(Hash(empty),new string('0',64)),
    valid.Replace(Nonce,"\\ud800"),valid.Replace(Nonce,"\\udc00"),
    valid.Replace(Nonce,Nonce.ToUpperInvariant()),valid.Replace(Hash(empty),Hash(empty).ToUpperInvariant()),
    valid.Replace("\"byteCount\":0","\"byteCount\":true"),valid.Replace("\"byteCount\":0","\"byteCount\":null")
   };
   foreach(string bad in badResults)Assert.Refuses("protocol-schema",()=>SyntheticProtocol.VerifyResult(Utf8.GetBytes(bad),Expected(empty)));
   foreach(byte[] bad in new[]{new byte[]{0xff},new byte[]{0xc0,0xaf},new byte[]{0xed,0xa0,0x80}})
    Assert.Refuses("protocol-schema",()=>SyntheticProtocol.VerifyResult(bad,Expected(empty)));
   // Verify raw malformed RESULTs only after actual boundary EOF/exit.
   foreach(string bad in badResults)RejectNativeResult(Utf8.GetBytes(bad));
   foreach(byte[] bad in new[]{new byte[]{0xff},new byte[]{0xc0,0xaf},new byte[]{0xed,0xa0,0x80}})RejectNativeResult(bad);
   string request=Request("0","");
   string[] badRequests={
    request+" ",request+"\n",request+"{}",request+"x","\ufeff"+request,
    request.Replace("\"byteCount\":0","\"byteCount\":0,\"byteCount\":0"),
    request.Replace("\"nonce\"","\"\\u006eonce\"").Replace("\"byteCount\":0","\"nonce\":\""+Nonce+"\",\"byteCount\":0"),
    request.Replace("\"byteCount\":0","\"unknown\":0"),request.Replace(",\"byteCount\":0",""),
    Request("-1",""),Request("65537",""),Request("0.0",""),Request("0e0",""),Request("\"0\"",""),Request("00",""),Request("null",""),Request("{}",""),
    Request("1","AA"),Request("1","AB=="),Request("1","AA== "),Request("1","__=="),Request("0","AA=="),Request("1","A==="),
    request.Replace(Nonce,"\\ud800"),request.Replace(Nonce,"\\udc00"),request.Replace(Nonce,"x"),request.Replace(Nonce,Nonce.ToUpperInvariant()),
    Request("999999999999999999999999999999999999999999999999999999999999999999","")
   };
   foreach(string bad in badRequests)RejectRequest(Utf8.GetBytes(bad));
   foreach(byte[] bad in new[]{new byte[]{0xff},new byte[]{0xc0,0xaf},new byte[]{0xed,0xa0,0x80}})RejectRequest(bad);
   Console.WriteLine("PASS RejectMalformedProtocol hostVectors="+(badResults.Length+3)+" nativeResults="+(badResults.Length+3)+" nativeRequests="+(badRequests.Length+3));
  }
  static void RejectNativeResult(byte[] bytes){
   string payload="process.stdin.resume();process.stdin.on('end',()=>process.stdout.write(Buffer.from('"+Convert.ToBase64String(bytes)+"','base64')));";
   ProtocolCapture c=Native(SyntheticProtocol.EncodeRequest(Input(new byte[0]),Nonce),payload);
   Assert.Equal<uint>(0,c.ExitCode);Assert.Refuses("protocol-schema",()=>SyntheticProtocol.VerifyResult(c.Stdout,Expected(new byte[0])));
  }
  static void RejectRequest(byte[] request){
   ProtocolCapture c=Native(request,null);Assert.True(c.ExitCode!=0,"Node malformed request refuses");Assert.Equal<int>(0,c.Stdout.Length);Assert.Equal<int>(0,c.Stderr.Length);
  }
  static void BoundBeforeAllocation(){
   Assert.Refuses("protocol-bound",()=>SyntheticProtocol.EncodeRequest(Input(new byte[65537]),Nonce));
   Assert.Refuses("protocol-schema",()=>SyntheticProtocol.EncodeRequest(Input(new byte[0]),"bad"));
   Assert.Refuses("protocol-schema",()=>SyntheticProtocol.EncodeRequest(new CanaryInput(new byte[1],new string('0',64)),Nonce));
   Assert.Refuses("protocol-bound",()=>SyntheticProtocol.VerifyResult(new byte[4097],Expected(new byte[0])));
   RejectRequest(Utf8.GetBytes(Request("65536",new string('A',87384))));
   RejectRequest(new byte[98304]);
   // 98305 requires a test-only ingress allowance so the fixed Node reader itself proves its cap.
   ProtocolCapture c=Native(new byte[98305],null);Assert.True(c.ExitCode!=0,"encoded request cap");Assert.Equal<int>(0,c.Stdout.Length);
   Console.WriteLine("PASS BoundBeforeAllocation input=65536 request=98304 result=4096");
  }
  static void AuthoredPayloadOnly(){
   string p=SyntheticProtocol.FixedNodePayload;
   Assert.True(p.Contains("require('crypto')")&&p.Contains("process.stdin")&&p.Contains("process.stdout"),"fixed builtins and stdio");
   foreach(string forbidden in new[]{"JSON.parse","child_process","require('fs')","require('net')","require('http')","import(","eval("})Assert.True(!p.Contains(forbidden),"no "+forbidden);
   Assert.True(typeof(SyntheticProtocol).GetField("FixedNodePayload",System.Reflection.BindingFlags.Static|System.Reflection.BindingFlags.NonPublic).IsLiteral,"authored constant");
   string host=System.IO.Path.Combine(System.IO.Path.GetDirectoryName(typeof(ProtocolTests).Assembly.Location),"SyntheticLauncher.exe");
   System.Reflection.Assembly assembly=System.Reflection.Assembly.LoadFile(host);
   Assert.True(assembly.GetType("Omnira.Creative.Synthetic.ProtocolTestHooks")==null,"production excludes payload override");
   Assert.True(assembly.GetType("Omnira.Creative.Synthetic.ProtocolTests")==null,"production excludes protocol tests");
   Console.WriteLine("PASS AuthoredPayloadOnly literal=true builtinCrypto=true noDynamicInputExecution=true productionOverrideAbsent=true");
  }
 }
 internal static class ProtocolTestHooks {internal static string Payload;}
}
