using System;
using System.Text;
using System.Security.Cryptography;
namespace Omnira.Creative.Synthetic {
 internal static class SyntheticProtocol {
  internal const int InputLimit=65536,RequestLimit=98304,ResultLimit=4096;
  static readonly UTF8Encoding Utf8=new UTF8Encoding(false,true);
  static void Require(bool value){if(!value)throw new SyntheticRefusal("protocol-schema");}
  internal static bool Hex(string value,int size){
   if(value==null||value.Length!=size)return false;
   foreach(char c in value)if(!((c>='0'&&c<='9')||(c>='a'&&c<='f')))return false;return true;
  }
  static string Hash(byte[] bytes){using(SHA256 h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
  internal static byte[] EncodeRequest(CanaryInput input,string nonce){
   Require(input!=null&&input.Bytes!=null);
   if(input.Bytes.Length>InputLimit)throw new SyntheticRefusal("protocol-bound");
   Require(Hex(nonce,32)&&Hex(input.Sha256,64)&&Hash(input.Bytes)==input.Sha256);
   byte[] encoded=Utf8.GetBytes("{\"nonce\":\""+nonce+"\",\"byteCount\":"+input.Bytes.Length.ToString(System.Globalization.CultureInfo.InvariantCulture)+",\"bytesBase64\":\""+Convert.ToBase64String(input.Bytes)+"\"}");
   if(encoded.Length>RequestLimit)throw new SyntheticRefusal("protocol-bound");return encoded;
  }
  internal static void VerifyResult(byte[] stdout,RequestExpectation expected){
   Require(stdout!=null&&expected!=null);
   if(stdout.Length>ResultLimit)throw new SyntheticRefusal("protocol-bound");
   string text;try{text=Utf8.GetString(stdout);}catch(DecoderFallbackException){throw new SyntheticRefusal("protocol-schema");}
   Require(text.Length>0&&text[0]!='\ufeff');
   Lexer lexer=new Lexer(text);string nonce=null,hash=null;int count=-1,seen=0;
   lexer.Space();lexer.Take('{');lexer.Space();
   for(int field=0;field<3;field++){
    string key=lexer.String();int bit=key=="nonce"?1:key=="byteCount"?2:key=="sha256"?4:0;
    Require(bit!=0&&(seen&bit)==0);seen|=bit;
    lexer.Space();lexer.Take(':');lexer.Space();
    if(bit==2)count=lexer.Count();else if(bit==1)nonce=lexer.String();else hash=lexer.String();
    lexer.Space();lexer.Take(field<2?',':'}');if(field<2)lexer.Space();
   }
   Require(lexer.End&&seen==7&&Hex(nonce,32)&&Hex(hash,64));
   Require(Hex(expected.Nonce,32)&&Hex(expected.Sha256,64)&&expected.ByteCount>=0&&expected.ByteCount<=InputLimit);
   Require(nonce==expected.Nonce&&hash==expected.Sha256&&count==expected.ByteCount);
  }
  // Purpose-specific flat lexer: decoded names checked before values; no JSON object parser.
  sealed class Lexer {
   readonly string text;int at;
   internal Lexer(string value){text=value;}
   internal bool End{get{return at==text.Length;}}
   char Peek{get{return at<text.Length?text[at]:'\0';}}
   internal void Space(){while(Peek==' '||Peek=='\t'||Peek=='\r'||Peek=='\n')at++;}
   internal void Take(char c){Require(at<text.Length&&text[at]==c);at++;}
   static int Digit(char c){return c>='0'&&c<='9'?c-'0':c>='a'&&c<='f'?c-'a'+10:c>='A'&&c<='F'?c-'A'+10:-1;}
   internal string String(){
    Take('"');StringBuilder value=new StringBuilder();
    while(at<text.Length){
     char c=text[at++];if(c=='"'){
      string s=value.ToString();
      for(int j=0;j<s.Length;j++){
       if(char.IsHighSurrogate(s[j])){Require(j+1<s.Length&&char.IsLowSurrogate(s[j+1]));j++;}
       else Require(!char.IsLowSurrogate(s[j]));
      }return s;
     }
     Require(c>=32);
     if(c=='\\'){
      Require(at<text.Length);c=text[at++];
      switch(c){
       case '"':case '\\':case '/':break;
       case 'b':c='\b';break;case 'f':c='\f';break;case 'n':c='\n';break;case 'r':c='\r';break;case 't':c='\t';break;
       case 'u':
        Require(at+4<=text.Length);int code=0;
        for(int j=0;j<4;j++){int d=Digit(text[at++]);Require(d>=0);code=code*16+d;}c=(char)code;break;
       default:throw new SyntheticRefusal("protocol-schema");
      }
     }value.Append(c);
    }throw new SyntheticRefusal("protocol-schema");
   }
   internal int Count(){
    int start=at,n=0;Require(Peek>='0'&&Peek<='9');
    while(Peek>='0'&&Peek<='9'){n=n*10+text[at++]-'0';Require(n<=InputLimit);}
    Require(at-start==1||text[start]!='0');return n;
   }
  }
  internal const string FixedNodePayload=@"'use strict';
const crypto=require('crypto');
const fail=()=>{throw new Error('protocol');};
function flat(s){
 let i=0,seen=0,r={};
 const ws=()=>{while(i<s.length&&' \t\r\n'.includes(s[i]))i++;};
 function str(){
  if(s[i++]!=='""')fail();let v='';
  while(i<s.length){let c=s[i++];if(c==='""'){
   for(let j=0;j<v.length;j++){let n=v.charCodeAt(j);if(n>=0xd800&&n<=0xdbff){let m=v.charCodeAt(++j);if(!(m>=0xdc00&&m<=0xdfff))fail();}else if(n>=0xdc00&&n<=0xdfff)fail();}return v;
  }if(c.charCodeAt(0)<32)fail();
  if(c==='\\'){if(i>=s.length)fail();c=s[i++];const a='""\\/bfnrt',b=['""','\\','/','\b','\f','\n','\r','\t'];let k=a.indexOf(c);
   if(k>=0)c=b[k];else if(c==='u'){let h=s.slice(i,i+4);if(!/^[0-9a-fA-F]{4}$/.test(h))fail();c=String.fromCharCode(parseInt(h,16));i+=4;}else fail();
  }v+=c;}fail();
 }
 function count(){let start=i,n=0;if(!(s[i]>='0'&&s[i]<='9'))fail();while(s[i]>='0'&&s[i]<='9'){n=n*10+s.charCodeAt(i++)-48;if(n>65536)fail();}if(i-start>1&&s[start]==='0')fail();return n;}
 ws();if(s[i++]!=='{')fail();ws();
 for(let fields=0;fields<3;fields++){
  let k=str(),bit=k==='nonce'?1:k==='byteCount'?2:k==='bytesBase64'?4:0;
  if(!bit||(seen&bit))fail();seen|=bit;ws();if(s[i++]!==':')fail();ws();r[k]=bit===2?count():str();ws();
  if(fields<2){if(s[i++]!==',')fail();ws();}else if(s[i++]!=='}')fail();
 }
 if(i!==s.length||seen!==7)fail();return r;
}
let chunks=[],size=0;
process.stdin.on('data',b=>{size+=b.length;if(size>98304){process.exit(3);return;}chunks.push(b);});
process.stdin.on('error',()=>{process.exitCode=3;});
process.stdin.on('end',()=>{try{
 const raw=Buffer.concat(chunks,size),text=raw.toString('utf8');
 if(!Buffer.from(text,'utf8').equals(raw)||text.charCodeAt(0)===0xfeff)fail();
 const r=flat(text);
 if(!/^[0-9a-f]{32}$/.test(r.nonce)||r.bytesBase64.length>87384||r.bytesBase64.length%4!==0)fail();
 if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(r.bytesBase64))fail();
 let padding=r.bytesBase64.endsWith('==')?2:r.bytesBase64.endsWith('=')?1:0;
 let length=r.bytesBase64.length/4*3-padding;if(length>65536||length!==r.byteCount)fail();
 const bytes=Buffer.from(r.bytesBase64,'base64');
 if(bytes.length!==r.byteCount||bytes.toString('base64')!==r.bytesBase64)fail();
 process.stdout.write(JSON.stringify({nonce:r.nonce,byteCount:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')}));
}catch(e){process.exitCode=3;}});
";
 }
}
