using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
namespace Omnira.Creative.Review {
 internal static class PackageManifest {
  static readonly UTF8Encoding Utf8=new UTF8Encoding(false,true);
  static void Require(bool ok){if(!ok)throw new ReviewRefusal(RefusalCode.InvalidManifest);}
  internal static bool Hex(string s,int n){if(s==null||s.Length!=n)return false;foreach(char c in s)if(!((c>='0'&&c<='9')||(c>='a'&&c<='f')))return false;return true;}
  internal static void Validate(Manifest m) {
   Require(m!=null&&m.Schema==ManifestSchema.Name&&Hex(m.Nonce,32)&&Hex(m.SourceCommit,40)&&m.HostLength>=1&&m.HostLength<=1048576&&Hex(m.HostSha256,64)&&m.RuntimeSha256==ManifestSchema.RuntimePin&&Hex(m.CompilerSha256,64));
   string v=m.CompilerVersion;Require(v!=null&&v.Length>0&&v.Length<=64);
   bool digit=false,dot=false;foreach(char c in v){if(c>='0'&&c<='9')digit=true;else{Require(c=='.'&&digit);digit=false;dot=true;}}Require(digit&&dot);
   Require(m.SourceDigests.Count==17);foreach(string key in ManifestSchema.SourceKeys){string h;Require(m.SourceDigests.TryGetValue(key,out h)&&Hex(h,64));}
  }
  internal static Manifest Parse(byte[] bytes) {
   Require(bytes!=null&&bytes.Length>0&&bytes.Length<=65536);
   string text;try{text=Utf8.GetString(bytes);}catch(DecoderFallbackException){throw new ReviewRefusal(RefusalCode.InvalidManifest);}
   Require(text.Length>0&&text[0]!='\uFEFF');
   // Validate the complete bounded token grammar, decoded uniqueness and numeric lexemes
   // before any schema object or dictionary is materialized.
   var scanner=new Scanner(text);scanner.Object(1);Require(scanner.AtEnd);
   var reader=new Reader(text);reader.Start();
   string schema=null,nonce=null,commit=null,host=null,runtime=null,compiler=null,version=null;int length=0;
   Dictionary<string,string> digests=null;
   while(reader.Next()) {
    string key=reader.Key();
    switch(key) {
     case "Schema":schema=reader.String();break;case "Nonce":nonce=reader.String();break;case "SourceCommit":commit=reader.String();break;
     case "HostLength":length=reader.Length();break;case "HostSha256":host=reader.String();break;case "RuntimeSha256":runtime=reader.String();break;
     case "CompilerSha256":compiler=reader.String();break;case "CompilerVersion":version=reader.String();break;
     case "SourceDigests":digests=reader.Digests();break;
     case "Authorities":reader.Authorities();break;
     case "InstallationAuthorized":case "WorkerActivated":reader.False();break;
     default:throw new ReviewRefusal(RefusalCode.InvalidManifest);
    }
   }
   Require(reader.Count==12&&schema==ManifestSchema.Name&&digests!=null);
   return new Manifest(nonce,commit,length,host,runtime,compiler,version,digests);
  }
  internal static byte[] Encode(Manifest m) {
   Validate(m);var b=new StringBuilder();b.Append('{');
   Pair(b,"Schema",m.Schema);Pair(b,"Nonce",m.Nonce);Pair(b,"SourceCommit",m.SourceCommit);
   b.Append("\"HostLength\":").Append(m.HostLength.ToString(CultureInfo.InvariantCulture)).Append(',');
   Pair(b,"HostSha256",m.HostSha256);Pair(b,"RuntimeSha256",m.RuntimeSha256);Pair(b,"CompilerSha256",m.CompilerSha256);Pair(b,"CompilerVersion",m.CompilerVersion);
   b.Append("\"SourceDigests\":{");bool first=true;foreach(string key in ManifestSchema.SourceKeys){if(!first)b.Append(',');first=false;Quote(b,key);b.Append(':');Quote(b,m.SourceDigests[key]);}
   b.Append("},\"Authorities\":{");first=true;foreach(string key in ManifestSchema.AuthorityNames){if(!first)b.Append(',');first=false;Quote(b,key);b.Append(":false");}
   b.Append("},\"InstallationAuthorized\":false,\"WorkerActivated\":false}");
   byte[] bytes=Utf8.GetBytes(b.ToString());Require(bytes.Length<=65536);return bytes;
  }
  static void Pair(StringBuilder b,string key,string value){Quote(b,key);b.Append(':');Quote(b,value);b.Append(',');}
  static void Quote(StringBuilder b,string value){b.Append('"');foreach(char c in value){if(c=='"'||c=='\\')b.Append('\\');b.Append(c);}b.Append('"');}
  // No arrays, null, negative, fractional or exponent numbers are in this finite format.
  sealed class Scanner {
   readonly string s;int p;
   internal Scanner(string text){s=text;}
   internal bool AtEnd{get{return p==s.Length;}}
   internal void White(){while(p<s.Length&&(s[p]==' '||s[p]=='\r'||s[p]=='\n'||s[p]=='\t'))p++;}
   internal void Take(char c){White();Require(p<s.Length&&s[p++]==c);}
   internal bool Peek(char c){White();return p<s.Length&&s[p]==c;}
   internal void Object(int depth){
    Require(depth<=3);Take('{');var names=new HashSet<string>(StringComparer.Ordinal);int count=0;
    if(Peek('}')){p++;return;}
    while(true){Require(++count<=64);string name=String();Require(names.Add(name));Take(':');Value(depth);if(Peek('}')){p++;return;}Take(',');}
   }
   void Value(int depth){
    White();Require(p<s.Length);char c=s[p];
    if(c=='{'){Object(depth+1);return;}if(c=='"'){String();return;}
    if(c=='f'){Literal("false");return;}if(c=='t'){Literal("true");return;}
    Number();
   }
   internal void Literal(string value){White();Require(p+value.Length<=s.Length&&string.CompareOrdinal(s,p,value,0,value.Length)==0);p+=value.Length;}
   internal string Number(){
    White();int start=p;Require(p<s.Length&&s[p]>='0'&&s[p]<='9');p++;
    if(s[start]!='0'){while(p<s.Length&&s[p]>='0'&&s[p]<='9')p++;}
    Require(p==s.Length||s[p]==','||s[p]=='}'||s[p]==' '||s[p]=='\t'||s[p]=='\r'||s[p]=='\n');
    return s.Substring(start,p-start);
   }
   int Quad(){
    Require(p+4<=s.Length);int value=0;for(int i=0;i<4;i++){char c=s[p++];int d=c>='0'&&c<='9'?c-'0':c>='a'&&c<='f'?c-'a'+10:c>='A'&&c<='F'?c-'A'+10:-1;Require(d>=0);value=value*16+d;}return value;
   }
   internal string String(){
    Take('"');var b=new StringBuilder();bool closed=false;
    while(p<s.Length){
     char c=s[p++];if(c=='"'){closed=true;break;}Require(c>=32);
     if(c=='\\'){
      Require(p<s.Length);char e=s[p++];switch(e){
       case '"':c='"';break;case '\\':c='\\';break;case '/':c='/';break;case 'b':c='\b';break;case 'f':c='\f';break;case 'n':c='\n';break;case 'r':c='\r';break;case 't':c='\t';break;
       case 'u':c=(char)Quad();break;default:throw new ReviewRefusal(RefusalCode.InvalidManifest);
      }
     }
     if(char.IsHighSurrogate(c)){
      b.Append(c);char low;
      if(p+1<s.Length&&s[p]=='\\'&&s[p+1]=='u'){p+=2;low=(char)Quad();}else{Require(p<s.Length);low=s[p++];}
      Require(char.IsLowSurrogate(low));b.Append(low);
     }else{Require(!char.IsLowSurrogate(c));b.Append(c);}
    }
    Require(closed);return b.ToString();
   }
  }
  sealed class Reader {
   readonly Scanner scan;readonly Stack<int> counts=new Stack<int>();int count;bool first;
   internal int Count{get{return count;}}
   internal Reader(string s){scan=new Scanner(s);}
   internal void Start(){scan.Take('{');count=0;first=true;}
   internal bool Next(){if(scan.Peek('}')){scan.Take('}');return false;}if(!first)scan.Take(',');first=false;count++;return true;}
   internal string Key(){string k=scan.String();scan.Take(':');return k;}
   internal string String(){return scan.String();}
   internal int Length(){int n;Require(int.TryParse(scan.Number(),NumberStyles.None,CultureInfo.InvariantCulture,out n)&&n>=1&&n<=1048576);return n;}
   internal void False(){scan.Literal("false");}
   internal Dictionary<string,string> Digests(){
    int outer=count;bool oldFirst=first;Start();var d=new Dictionary<string,string>(StringComparer.Ordinal);while(Next()){string k=Key();d.Add(k,String());}
    Require(count==17);count=outer;first=oldFirst;return d;
   }
   internal void Authorities(){
    int outer=count;bool oldFirst=first;Start();var found=new HashSet<string>(StringComparer.Ordinal);while(Next()){string k=Key();Require(Array.IndexOf(ManifestSchema.AuthorityNames,k)>=0);False();found.Add(k);}
    Require(count==9&&found.Count==9);count=outer;first=oldFirst;
   }
  }
 }
}
