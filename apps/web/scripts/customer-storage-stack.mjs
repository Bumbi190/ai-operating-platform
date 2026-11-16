// Reused from the reviewed local CMS/Storage rehearsal. Default remains disposable.
// Persistent Etapp 1 mode uses uniquely owned local volumes; never a hosted endpoint.
import assert from 'node:assert/strict'
import {spawn,spawnSync} from 'node:child_process'
import {createHmac,randomBytes,randomUUID} from 'node:crypto'
import {createServer as httpServer,request as httpRequest} from 'node:http'
import {mkdtemp,rm} from 'node:fs/promises'
import {createInterface} from 'node:readline'
import {Writable} from 'node:stream'
import path from 'node:path'
import {createServer as tcpServer} from 'node:net'
import {freemem,tmpdir} from 'node:os'
import {REFERENCE_TEST_IMAGES,assertReferenceLocalConfig,cleanupReferenceResources} from './reference-local-stack.mjs'
const LOCAL_TEST_IMAGES={...REFERENCE_TEST_IMAGES,storage:'supabase/storage-api:v1.81.0'}

export const fixtureEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>
  /^(path|systemroot|windir|comspec|pathext|temp|tmp|home|userprofile|appdata|localappdata|programfiles|programfiles\(x86\)|programdata|playwright_browsers_path)$/i.test(key)))
// A directory capability, not a realpath/check followed by a pathname read.
// Windows resolves each component relative to a verified directory handle, and opens the
// final file with NtCreateFile/FILE_OPEN_REPARSE_POINT, without sharing writes/deletion. Inspection
// and I/O use that same handle. Unsupported platforms fail before private I/O.
// This short-lived native child has no listener; its only channel is private IPC.
const privateNames=new Set(['runtime-private.json','stack-private.json','harvey-public-jwk.json','runtime-receipt.json','next-local.log','scb.env'])
const privateDirectoryPeers=new WeakMap()
const privateIoSource=String.raw`
using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Web.Script.Serialization;
using Microsoft.Win32.SafeHandles;
public static class PrivateLocalFiles {
  [StructLayout(LayoutKind.Sequential)] struct Info {
    public uint Attributes; public System.Runtime.InteropServices.ComTypes.FILETIME Creation,Access,Write;
    public uint Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;
  }
  [StructLayout(LayoutKind.Sequential)] struct Unicode {public ushort Length,MaximumLength;public IntPtr Buffer;}
  [StructLayout(LayoutKind.Sequential)] struct Attributes {public int Length;public IntPtr Root,Name;public uint Flags;public IntPtr Security,Qos;}
  [StructLayout(LayoutKind.Sequential)] struct IoStatus {public IntPtr Status,Information;}
  [DllImport("ntdll.dll")] static extern int NtCreateFile(out SafeFileHandle h,uint access,ref Attributes a,out IoStatus io,IntPtr allocation,uint attributes,uint share,uint disposition,uint options,IntPtr ea,uint eaLength);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFileW(string p,uint a,uint s,IntPtr sa,uint d,uint f,IntPtr t);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle h,out Info i);
  [DllImport("kernel32.dll")] static extern uint GetFileType(SafeFileHandle h);
  [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptorW(string s,uint r,out IntPtr d,out uint size);
  [DllImport("advapi32.dll")] static extern uint GetSecurityInfo(SafeFileHandle h,int type,uint info,out IntPtr owner,out IntPtr group,out IntPtr dacl,out IntPtr sacl,out IntPtr sd);
  [DllImport("advapi32.dll")] static extern uint GetSecurityDescriptorLength(IntPtr sd);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr p);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern uint GetDriveTypeW(string root);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern uint GetFinalPathNameByHandleW(SafeFileHandle h,StringBuilder b,uint n,uint flags);
  [DllImport("advapi32.dll")] static extern bool GetTokenInformation(IntPtr h,int c,IntPtr b,int n,out int size);
  static string LogonSid(){using(var id=WindowsIdentity.GetCurrent()){int n;GetTokenInformation(id.Token,28,IntPtr.Zero,0,out n);if(n<16||n>1024)throw new IOException();IntPtr p=Marshal.AllocHGlobal(n);try{if(!GetTokenInformation(id.Token,28,p,n,out n)||Marshal.ReadInt32(p)!=1)throw new IOException();return new SecurityIdentifier(Marshal.ReadIntPtr(p,IntPtr.Size==8?8:4)).Value;}finally{Marshal.FreeHGlobal(p);}}}
  static readonly string Logon=LogonSid();
  static readonly string Sid=WindowsIdentity.GetCurrent().User.Value;
  static readonly HashSet<string> Names=new HashSet<string>{"runtime-private.json","stack-private.json","harvey-public-jwk.json","runtime-receipt.json","next-local.log","scb.env"};
  static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=4000000};
  static Info Inspect(SafeFileHandle h,bool directory) {
    Info i;
    if(h.IsInvalid||GetFileType(h)!=1||!GetFileInformationByHandle(h,out i))throw new IOException();
    if((i.Attributes&0x400)!=0||((i.Attributes&0x10)!=0)!=directory||(!directory&&i.Links!=1))throw new IOException();
    return i;
  }
  static void PrivateAcl(SafeFileHandle h) {
    IntPtr owner,group,dacl,sacl,sd;
    if(GetSecurityInfo(h,1,5,out owner,out group,out dacl,out sacl,out sd)!=0)throw new IOException();
    try {
      byte[] bytes=new byte[GetSecurityDescriptorLength(sd)]; Marshal.Copy(sd,bytes,0,bytes.Length);
      var descriptor=new RawSecurityDescriptor(bytes,0);
      if(descriptor.Owner==null||descriptor.Owner.Value!=Sid||descriptor.DiscretionaryAcl==null)throw new IOException();
      foreach(GenericAce ace in descriptor.DiscretionaryAcl) {
        var access=ace as QualifiedAce;
        if(access!=null&&access.AceQualifier==AceQualifier.AccessAllowed&&access.AccessMask!=0&&access.SecurityIdentifier.Value!=Sid&&access.SecurityIdentifier.Value!=Logon&&access.SecurityIdentifier.Value!="S-1-5-18"&&access.SecurityIdentifier.Value!="S-1-5-32-544")throw new IOException();
      }
    } finally {LocalFree(sd);}
  }
  static IntPtr Security() {
    IntPtr sd;uint size;
    if(!ConvertStringSecurityDescriptorToSecurityDescriptorW("O:"+Sid+"D:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;FA;;;"+Sid+")",1,out sd,out size))throw new IOException();
    return sd;
  }
  static SafeFileHandle OpenRelative(SafeFileHandle root,string name,bool directory,uint access,uint disposition,IntPtr security,out bool missing) {
    var unicode=new Unicode{Length=(ushort)(name.Length*2),MaximumLength=(ushort)(name.Length*2),Buffer=Marshal.StringToHGlobalUni(name)};
    IntPtr up=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(Unicode)));
    try {
      Marshal.StructureToPtr(unicode,up,false);
      var attributes=new Attributes{Length=Marshal.SizeOf(typeof(Attributes)),Root=root.DangerousGetHandle(),Name=up,Flags=0x1040,Security=security};
      SafeFileHandle file;IoStatus io;
      int status=NtCreateFile(out file,access|0x100000,ref attributes,out io,IntPtr.Zero,0,1,disposition,0x200020u|(directory?1u:0x40u),IntPtr.Zero,0);
      missing=status==unchecked((int)0xC0000034);
      if(status<0) {if(file!=null)file.Dispose();if(missing)return null;throw new IOException();}
      return file;
    } finally {Marshal.FreeHGlobal(up);Marshal.FreeHGlobal(unicode.Buffer);}
  }
  static SafeFileHandle PinRoot(string root,bool create,List<SafeFileHandle> pins) {
    if(root.Length<4||!Char.IsLetter(root[0])||root[1]!=':'||root[2]!='\\')throw new IOException();
    var parts=root.Substring(3).Split('\\');
    foreach(string part in parts)if(part.Length==0||part=="."||part==".."||part.EndsWith(".")||part.EndsWith(" ")||part.IndexOfAny(new char[]{':','/','\0','*','?','"','<','>','|'})>=0||System.Text.RegularExpressions.Regex.IsMatch(part,@"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)",System.Text.RegularExpressions.RegexOptions.IgnoreCase))throw new IOException();
    var drive=CreateFileW(root.Substring(0,3),0x80,1,IntPtr.Zero,3,0x02200000,IntPtr.Zero);
    pins.Add(drive);Inspect(drive,true);
    var volume=new StringBuilder(32768);
    if(GetDriveTypeW(root.Substring(0,3))!=3||GetFinalPathNameByHandleW(drive,volume,32768,1)!=49||!volume.ToString().StartsWith(@"\\?\Volume{"))throw new IOException();
    SafeFileHandle current=drive;
    foreach(string part in parts) {
      IntPtr sd=create?Security():IntPtr.Zero;SafeFileHandle handle;bool missing;
      try {handle=OpenRelative(current,part,true,0x20080,create?3u:1u,sd,out missing);}finally{if(sd!=IntPtr.Zero)LocalFree(sd);}
      if(handle==null)throw new IOException();
      pins.Add(handle);Inspect(handle,true);current=handle;
    }
    PrivateAcl(current);return current;
  }
  [StructLayout(LayoutKind.Sequential)] struct BasicProcess {public IntPtr Reserved,Peb,R2,R3,Pid,Parent;}
  [DllImport("iphlpapi.dll")] static extern uint GetExtendedTcpTable(IntPtr table,ref int size,bool sort,int family,int type,int reserved);
  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr p,int type,out BasicProcess info,int size,out int returned);
  static bool Peer(Dictionary<string,object> command) {
    int server=Convert.ToInt32(command["serverPort"]),client=Convert.ToInt32(command["clientPort"]),expected=Convert.ToInt32(command["expectedPid"]);
    bool descendants=(bool)command["descendants"];
    if(server<1||server>65535||client<1||client>65535||expected<1)throw new IOException();
    int size=0;if(GetExtendedTcpTable(IntPtr.Zero,ref size,false,2,5,0)!=122||size<4||size>16777216)throw new IOException();
    IntPtr table=Marshal.AllocHGlobal(size);
    try {
      if(GetExtendedTcpTable(table,ref size,false,2,5,0)!=0)throw new IOException();
      int count=Marshal.ReadInt32(table);if(count<0||4L+24L*count>size)throw new IOException();
      for(int i=0;i<count;i++) {
        IntPtr row=IntPtr.Add(table,4+24*i);
        if(Marshal.ReadInt32(row)!=5||Marshal.ReadInt32(row,4)!=0x0100007f||Marshal.ReadInt32(row,12)!=0x0100007f||(Marshal.ReadByte(row,8)*256+Marshal.ReadByte(row,9))!=server||(Marshal.ReadByte(row,16)*256+Marshal.ReadByte(row,17))!=client)continue;
        int pid=Marshal.ReadInt32(row,20);
        for(int depth=0;depth<5;depth++) {
          if(pid==expected)return true;
          if(!descendants||pid<1)return false;
          using(var process=System.Diagnostics.Process.GetProcessById(pid)) {
            BasicProcess info;int returned;
            if(NtQueryInformationProcess(process.Handle,0,out info,Marshal.SizeOf(typeof(BasicProcess)),out returned)!=0)return false;
            pid=info.Parent.ToInt32();
          }
        }
        return false;
      }
      return false;
    } finally {Marshal.FreeHGlobal(table);}
  }

  static object Operation(SafeFileHandle root,Dictionary<string,object> command) {
    if((string)command["mode"]=="peer")return Peer(command);
    string name=(string)command["name"],mode=(string)command["mode"];
    if(!Names.Contains(name)||!(mode=="read"||mode=="write"||mode=="create"||mode=="append")||(name=="next-local.log"&&mode!="append")||(mode=="append"&&name!="next-local.log"))throw new IOException();
    bool read=mode=="read";uint disposition=read?1u:mode=="create"?2u:3u;
    byte[] data=read?null:Convert.FromBase64String((string)command["data"]);
    if(data!=null&&data.Length>1048576)throw new IOException();
    IntPtr sd=read?IntPtr.Zero:Security();SafeFileHandle file;bool missing;
    try {file=OpenRelative(root,name,false,read?0x80020000u:0xC0020000u,disposition,sd,out missing);}finally{if(sd!=IntPtr.Zero)LocalFree(sd);}
    if(file==null) {if(read&&missing)return null;throw new IOException();}
    using(file) {
      var info=Inspect(file,false);PrivateAcl(file);
      long limit=name=="next-local.log"?16777216:1048576;
      if(info.SizeHigh!=0||info.SizeLow>limit)throw new IOException();
      using(var stream=new FileStream(file,read?FileAccess.Read:FileAccess.ReadWrite)) {
        if(read) {
          byte[] bytes=new byte[(int)stream.Length];int total=0,count;
          while(total<bytes.Length&&(count=stream.Read(bytes,total,bytes.Length-total))>0)total+=count;
          if(total!=bytes.Length)throw new IOException();
          return Convert.ToBase64String(bytes);
        }
        if(mode=="append") {if(stream.Length+data.Length>limit)throw new IOException();stream.Position=stream.Length;}
        else {stream.SetLength(0);}
        stream.Write(data,0,data.Length);stream.Flush(true);return true;
      }
    }
  }
  static void Reply(object value) {Console.WriteLine(Json.Serialize(value));Console.Out.Flush();}
  public static void Run() {
    var pins=new List<SafeFileHandle>();
    try {
      var init=Json.Deserialize<Dictionary<string,object>>(Console.ReadLine());
      SafeFileHandle root=PinRoot((string)init["root"],(bool)init["create"],pins);Reply(new {ready=true});
      string line;
      while((line=Console.ReadLine())!=null) {
        try {Reply(new {ok=true,value=Operation(root,Json.Deserialize<Dictionary<string,object>>(line))});}
        catch {Reply(new {ok=false});}
      }
    } catch {Reply(new {ready=false});}
    finally {for(int i=pins.Count-1;i>=0;i--)pins[i].Dispose();}
  }
}
`

export async function openPrivateLocalDirectory(directory,{create=false}={}) {
  // No insecure fallback on Node versions/platforms without the required native
  // semantics. Never send a path through a command line or invoke a user shell.
  if(process.platform!=='win32'||typeof directory!=='string'||!path.win32.isAbsolute(directory)||directory!==path.win32.normalize(directory))throw Error('PRIVATE_LOCAL_IO_UNAVAILABLE')
  const script="$ErrorActionPreference='Stop'; try { Add-Type -TypeDefinition @'\n"+privateIoSource+"\n'@ -ReferencedAssemblies System.Web.Extensions; [PrivateLocalFiles]::Run() } catch { [Console]::Out.WriteLine('{\"ready\":false}') }"
  const child=spawn('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{env:fixtureEnv,windowsHide:true,stdio:['pipe','pipe','ignore']})
  const lines=createInterface({input:child.stdout,crlfDelay:Infinity})
  let pending,closed=false
  const fail=()=>{closed=true;if(pending){clearTimeout(pending.timer);pending.reject(Error('PRIVATE_LOCAL_IO_FAILED'));pending=undefined}}
  child.on('error',fail);child.on('exit',fail);child.stdin.on('error',fail)
  lines.on('line',line=>{if(!pending)return;const current=pending;pending=undefined;clearTimeout(current.timer);try{current.resolve(JSON.parse(line))}catch{current.reject(Error('PRIVATE_LOCAL_IO_FAILED'))}})
  let tail=Promise.resolve()
  const exchange=command=>{
    const result=tail.then(()=>new Promise((resolve,reject)=>{
      if(closed){reject(Error('PRIVATE_LOCAL_IO_FAILED'));return}
      pending={resolve,reject,timer:setTimeout(()=>{fail();child.kill()},15000)}
      child.stdin.write(JSON.stringify(command)+'\n')
    }))
    tail=result.catch(()=>{});return result
  }
  const ready=await exchange({root:directory,create}).catch(()=>null)
  if(!ready?.ready){child.kill();throw Error('PRIVATE_LOCAL_IO_UNAVAILABLE')}
  const operation=async(mode,name,data)=>{
    if(!privateNames.has(name))throw Error('PRIVATE_LOCAL_FILE_DENIED')
    const reply=await exchange({mode,name,...(data===undefined?{}:{data:Buffer.from(data).toString('base64')})})
    if(!reply.ok)throw Error('PRIVATE_LOCAL_FILE_DENIED')
    return mode==='read'?(reply.value===null?null:Buffer.from(reply.value,'base64').toString('utf8')):undefined
  }
  const capability={
    read:name=>operation('read',name),
    write:(name,data,{exclusive=false}={})=>operation(exclusive?'create':'write',name,data),
    log:()=>new Writable({write(chunk,encoding,callback){operation('append','next-local.log',chunk).then(()=>callback(),()=>callback(Error('PRIVATE_LOCAL_LOG_FAILED')))}}),
    async close(){await tail;child.stdin.end();await new Promise(resolve=>{if(closed)resolve();else child.once('exit',resolve)});lines.close()},
  }
  privateDirectoryPeers.set(capability,async command=>{const result=await exchange(command);if(!result.ok||result.value!==true)throw Error('LOCAL_PEER_DENIED')})
  return capability
}

// No DNS, proxy, configurable URL or redirects. Before sending even HTTP
// headers, verify the peer of this established socket, not a port checked
// earlier. The OS must identify our gateway PID or the started Next process.
export async function localProspectRequest(kind,{privateFiles,expectedPid,serviceKey,password,email,cronSecret}={}) {
  const verify=privateDirectoryPeers.get(privateFiles)
  if(!verify)throw Error('LOCAL_REQUEST_DENIED')
  let port,endpoint,headers={},body
  if(kind==='create-user') {
    if(typeof serviceKey!=='string'||!serviceKey||typeof password!=='string'||!password||!['webbuilder-review@omnira.local','webbuilder-other@omnira.local'].includes(email))throw Error('LOCAL_REQUEST_DENIED')
    port=56993;endpoint='/auth/v1/admin/users';expectedPid=process.pid
    headers={apikey:serviceKey,authorization:'Bearer '+serviceKey,'content-type':'application/json'}
    body=JSON.stringify({email,password,email_confirm:true})
  }else if(kind==='drain'||kind==='ready') {
    if(!Number.isSafeInteger(expectedPid)||expectedPid<1)throw Error('LOCAL_REQUEST_DENIED')
    port=56994;endpoint=kind==='drain'?'/api/runs/drain':'/api/website-build-settings'
    if(kind==='drain'){
      if(typeof cronSecret!=='string'||!/^[a-f0-9]{64}$/.test(cronSecret))throw Error('LOCAL_REQUEST_DENIED')
      headers={authorization:'Bearer '+cronSecret}
    }
  }else throw Error('LOCAL_REQUEST_DENIED')
  try {
    return await new Promise((resolve,reject)=>{
      const request=httpRequest({hostname:'127.0.0.1',port,path:endpoint,method:kind==='create-user'?'POST':'GET',headers,agent:false,signal:AbortSignal.timeout(kind==='drain'?60000:5000)},async response=>{
        try {
          if(kind==='ready'){response.destroy();resolve(response.statusCode===401);return}
          if(response.statusCode<200||response.statusCode>=300)throw Error()
          if(kind==='drain'){response.destroy();resolve(true);return}
          let size=0;const chunks=[]
          for await(const chunk of response){size+=chunk.length;if(size>65536)throw Error();chunks.push(chunk)}
          const user=JSON.parse(Buffer.concat(chunks).toString('utf8'))
          if(typeof user.id!=='string'||!/^[a-f0-9-]{36}$/.test(user.id))throw Error()
          resolve({id:user.id})
        }catch{response.destroy();reject(Error('LOCAL_REQUEST_FAILED'))}
      })
      request.on('error',()=>reject(Error('LOCAL_REQUEST_FAILED')))
      request.on('socket',socket=>socket.once('connect',async()=>{
        try {
          await verify({mode:'peer',serverPort:port,clientPort:socket.localPort,expectedPid,descendants:kind!=='create-user'})
          if(socket.destroyed||request.destroyed)throw Error()
          request.end(body)
        }catch{request.destroy(Error('LOCAL_REQUEST_FAILED'))}
      }))
    })
  }catch{throw Error('LOCAL_REQUEST_FAILED')}
}

export async function readPrivateLocalJson(files,name) {
  const text=await files.read(name)
  if(text===null)return null
  try {const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value}
  catch {throw Error('INVALID_PRIVATE_LOCAL_JSON')}
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const sqlLiteral=value=>"'"+value.replaceAll("'","''")+"'"
const byteLimit=10*1024*1024 // Three normalised 180 kB WEBPs, base64-encoded, plus their metadata.

async function bodyBytes(req) {
  if (Number(req.headers['content-length'])>byteLimit) throw RangeError('Body exceeds 10 MiB')
  let size=0
  const parts=[]
  for await(const chunk of req.iterator({destroyOnReturn:false})) {
    size+=chunk.length
    if(size>byteLimit) throw RangeError('Body exceeds 10 MiB')
    parts.push(chunk)
  }
  return parts.length?Buffer.concat(parts):undefined
}

export async function listenLocally(server,port=0) {
  await new Promise((resolve,reject)=>{
    server.once('error',reject)
    server.listen(port,'127.0.0.1',()=>{server.off('error',reject);resolve()})
  })
  return 'http://127.0.0.1:'+server.address().port
}

export function matchesOrigin(req,origin) {
  return req.headers.host===new URL(origin).host && /^\/(?!\/)/.test(req.url||'') && !/[\\\r\n]/.test(req.url)
}

export async function closeHttp(server) {
  if(!server?.listening) return
  const closed=new Promise(resolve=>server.close(resolve))
  server.closeAllConnections()
  await closed
}

// Windows Docker drops published ports on a strictly internal network. Use the
// owned PostgreSQL Alpine container's nc, reached over an OS-local pipe, to the
// two fixed upstreams. The browser cannot open either raw service over TCP.
async function serviceRelay(service,port,dockerPrefix,dbContainer) {
  const directory=process.platform==='win32'?null:await mkdtemp(path.join(tmpdir(),'omnira-dlr-'))
  const socketPath=directory?path.join(directory,'relay.sock'):'\\\\.\\pipe\\omnira-customer-'+randomUUID()
  const active=new Map()
  const server=tcpServer(socket=>{
    if(active.size>=16){socket.destroy();return}
    const remote=spawn('docker',[...dockerPrefix,'exec','-i',dbContainer,'busybox','nc',service,String(port)],{
      env:fixtureEnv,windowsHide:true,stdio:['pipe','pipe','ignore'],
    })
    active.set(socket,remote)
    const end=()=>{
      if(!active.delete(socket))return
      socket.destroy();remote.stdin.destroy();remote.stdout.destroy()
      if(remote.exitCode===null)remote.kill()
    }
    socket.on('error',end);socket.on('close',end)
    remote.on('error',end);remote.on('exit',()=>socket.end())
    remote.stdin.on('error',end);remote.stdout.on('error',end)
    socket.setTimeout(25000,end)
    socket.pipe(remote.stdin);remote.stdout.pipe(socket)
  })
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socketPath,()=>{server.off('error',reject);resolve()})})
  }catch(error){if(directory)await rm(directory,{recursive:true,force:true});throw error}
  function exchange(endpoint,method='GET',headers={},body=undefined,timeout=20000){
    return new Promise((resolve,reject)=>{
      const request=httpRequest({socketPath,path:endpoint,method,headers,agent:false,signal:AbortSignal.timeout(timeout)},async response=>{
        try{
          let size=0
          const chunks=[]
          for await(const chunk of response){
            size+=chunk.length
            if(size>12*1024*1024)throw Error('Oversized local service response')
            chunks.push(chunk)
          }
          resolve({status:response.statusCode,headers:response.headers,bytes:Buffer.concat(chunks)})
        }catch(error){reject(error)}
      })
      request.once('error',reject);request.end(body)
    })
  }
  return {exchange,close:async()=>{
    const closed=new Promise(resolve=>server.close(resolve))
    for(const [socket,remote] of active){socket.destroy();remote.kill()}
    await closed
    if(directory)await rm(directory,{recursive:true,force:true})
  }}
}

async function waitHealthy(relay,endpoint,label) {
  const until=Date.now()+30000
  while(Date.now()<until){
    try{const reply=await relay.exchange(endpoint,'GET',{},undefined,1500);if(reply.status===200)return}catch{}
    await sleep(240)
  }
  throw Error(label+' failed to become ready')
}

export async function startCmsStorageStack(siteOrigin,options={}) {
  assertReferenceLocalConfig({mode:'isolated-local',url:siteOrigin})
  if(process.env.DOCKER_HOST||process.env.DOCKER_CONTEXT) throw Error('Unset Docker endpoint overrides for this local-only rehearsal')
  if(freemem()<1536*1024**2)throw Error('1.5 GiB free host RAM required for the bounded dealer pilot')
  const persistent=Boolean(options.persistentPath),applicationDatabase=Boolean(options.applicationDatabase)
  // Next's development middleware normalizes loopback redirects to localhost.
  // Both names reach the same fixed, owned port; no wildcard CORS origin.
  const browserOrigins=new Set([siteOrigin,...(persistent&&applicationDatabase&&new URL(siteOrigin).hostname==='127.0.0.1'?['http://localhost:'+new URL(siteOrigin).port]:[])])
  if(persistent&&(!path.isAbsolute(options.persistentPath)||!applicationDatabase))throw Error('Absolute local state path and application database required')
  if(persistent&&path.basename(options.persistentPath)!=='stack-private.json')throw Error('INVALID_LOCAL_STACK_PATH')
  if(options.privateFiles!==undefined&&(!persistent||!privateDirectoryPeers.has(options.privateFiles)))throw Error('INVALID_LOCAL_DIRECTORY_CAPABILITY')
  const ownsPrivateFiles=persistent&&options.privateFiles===undefined
  const privateFiles=persistent?(options.privateFiles??await openPrivateLocalDirectory(path.dirname(options.persistentPath),{create:true})):null
  const closePrivateFiles=async()=>{if(ownsPrivateFiles)await privateFiles.close()}
  let saved
  try {saved=persistent?await readPrivateLocalJson(privateFiles,'stack-private.json'):null}
  catch {await closePrivateFiles();throw Error('INVALID_LOCAL_STACK_STATE')}
  if(saved&&(saved.version!==1||saved.siteOrigin!==siteOrigin||!/^omnira-etapp1-[a-f0-9-]{36}$/.test(saved.id)||typeof saved.secret!=='string'||!/^[a-f0-9]{96}$/.test(saved.secret)||typeof saved.password!=='string'||!/^[a-f0-9]{64}$/.test(saved.password))){await closePrivateFiles();throw Error('INVALID_LOCAL_STACK_STATE')}
  const id=saved?.id??(persistent?'omnira-etapp1-':'omnira-cms-storage-')+randomUUID(),label=persistent?'omnira.etapp1.local':'omnira.cms.storage.fixture'
  const names=['db','auth','rest','storage'].map(service=>id+'-'+service)
  const password=saved?.password??randomBytes(32).toString('hex'),secret=saved?.secret??randomBytes(48).toString('hex')
  const images={...LOCAL_TEST_IMAGES,...(applicationDatabase?{db:'public.ecr.aws/supabase/postgres@sha256:06ddc7962e11ab0f4f0334fd05671e97c30ea202f6e6a7113800bd3d6e416108'}:{})}
  try {if(persistent&&!saved)await privateFiles.write('stack-private.json',JSON.stringify({version:1,id,siteOrigin,password,secret}),{exclusive:true})}
  finally {await closePrivateFiles()}
  const q=sqlLiteral
  const dockerPrefix=[]
  function docker(args,input,extra={}) {
    const result=spawnSync('docker',[...dockerPrefix,...args],{input,encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024,
      env:{...fixtureEnv,...extra},windowsHide:true})
    if(result.status!==0){
      const brief=(result.stderr||result.error?.message||'failed').replaceAll(secret,'[secret]').replaceAll(password,'[secret]')
      throw Error('Dealer fixture Docker '+args[0]+': '+brief.slice(0,450))
    }
    return extra.raw?result.stdout:result.stdout.trim()
  }
  const context=docker(['context','show'])
  assert.match(context,/^[a-zA-Z0-9_.-]+$/)
  const endpoint=docker(['context','inspect',context,'--format','{{.Endpoints.docker.Host}}'])
  assert(/^unix:\/\/\/(?!\/)[^\r\n]+$/.test(endpoint)||/^npipe:\/\/\/\/\.\/pipe\/[a-zA-Z0-9._-]+$/.test(endpoint),'Local Docker engine required')
  dockerPrefix.push('--context',context)
  const sql=text=>docker(['exec','-i',names[0],'psql','-X','-qAt',...(applicationDatabase?['--single-transaction']:[]),'-v','ON_ERROR_STOP=1','-U',applicationDatabase?'supabase_admin':'postgres','-d','postgres'],text)
  function token(role){
    const part=value=>Buffer.from(JSON.stringify(value)).toString('base64url')
    const issued=Math.floor(Date.now()/1000)
    const data=part({alg:'HS256',typ:'JWT'})+'.'+part({role,iss:'supabase',iat:issued,exp:issued+(persistent?14*24:4)*3600})
    return data+'.'+createHmac('sha256',secret).update(data).digest('base64url')
  }
  const serviceKey=token('service_role'),anonKey=token('anon')
  const relays=[]
  let gateway,gatewayOrigin
  let ownedNetwork=false,closed=false
  async function close(){
    if(closed)return
    closed=true
    try{
      if(gateway)await closeHttp(gateway)
      for(const relay of relays) await relay.close()
    }finally{
      if(ownedNetwork&&!persistent)await cleanupReferenceResources({id,label,names,docker})
      if(ownedNetwork&&persistent)for(const name of names.slice().reverse()){
        const found=docker(['ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}'])
        if(found&&docker(['inspect','--format','{{index .Config.Labels "'+label+'"}}',name])===id)docker(['stop','--time','5',name])
      }
    }
  }
  function container(name,memory,env,extra=[],command=[]){
    const found=docker(['ps','-a','--filter','name=^/'+id+'-'+name+'$','--format','{{.Names}}'])
    if(found){
      if(!persistent||docker(['inspect','--format','{{index .Config.Labels "'+label+'"}}',found])!==id||docker(['inspect','--format','{{.Config.Image}}',found])!==images[name])throw Error('LOCAL_CONTAINER_OWNERSHIP_MISMATCH')
      const actualCommand=JSON.parse(docker(['inspect','--format','{{json .Config.Cmd}}',found]))
      if(command.length&&JSON.stringify(actualCommand)!==JSON.stringify(command)){
        // Replace only our container configuration. Named volumes remain intact.
        docker(['rm','-f',found])
      }else{docker(['start',found]);return}
    }
    docker(['run','--pull=never','-d','--name',id+'-'+name,'--label',label+'='+id,'--network',id,'--network-alias',name,
      '--memory',memory,'--memory-swap',memory,'--cpus','1','--pids-limit','96','--restart','no',
      ...Object.keys(env).flatMap(key=>['-e',key]),...extra,images[name],...command],undefined,env)
  }
  try{
    for(const service of ['db','auth','rest','storage'])docker(['image','inspect',images[service],'--format','{{.Id}}'])
    const existingNetwork=docker(['network','ls','--filter','name=^'+id+'$','--format','{{.Name}}'])
    if(existingNetwork){
      if(!persistent||docker(['network','inspect','--format','{{index .Labels "'+label+'"}}',id])!==id||docker(['network','inspect','--format','{{.Internal}}',id])!=='true')throw Error('LOCAL_NETWORK_OWNERSHIP_MISMATCH')
    }else docker(['network','create','--internal','--label',label+'='+id,id])
    if(persistent)for(const name of ['db','storage']){
      const volume=id+'-'+name+'-data',found=docker(['volume','ls','--filter','name=^'+volume+'$','--format','{{.Name}}'])
      if(found){if(docker(['volume','inspect','--format','{{index .Labels "'+label+'"}}',volume])!==id)throw Error('LOCAL_VOLUME_OWNERSHIP_MISMATCH')}
      else docker(['volume','create','--label',label+'='+id,volume])
    }
    ownedNetwork=true
    container('db',applicationDatabase?'768m':'384m',{POSTGRES_PASSWORD:password},['--shm-size','32m',...(persistent?['--mount','type=volume,source='+id+'-db-data,target=/var/lib/postgresql/data']:['--tmpfs','/var/lib/postgresql/data:rw,nosuid,size=192m'])],
      [...(applicationDatabase?['postgres','-c','shared_preload_libraries=pg_stat_statements,pg_cron,pg_net','-c','cron.database_name=postgres','-c','cron.launch_active_jobs=off','-c','listen_addresses=*']:[]),'-c','shared_buffers=24MB','-c','max_connections=60','-c','work_mem=1MB'])
    let ready=false
    for(let i=0;i<70;i++){
      try{docker(['exec',names[0],'pg_isready','-h','127.0.0.1','-U','postgres']);if(sql('select 1')==='1'){ready=true;break}}catch{}
      await sleep(250)
    }
    assert(ready,'New PostgreSQL fixture did not start')
    if(applicationDatabase){
      sql('alter role supabase_auth_admin with password '+q(password)+';alter role authenticator with password '+q(password)+';alter role supabase_storage_admin with password '+q(password)+';grant anon,authenticated,service_role to authenticator;grant usage on schema public,auth,extensions to supabase_storage_admin;')
    }else sql('create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;'+
      'create role authenticator login noinherit password '+q(password)+';grant anon,authenticated,service_role to authenticator;'+
      'create role supabase_auth_admin login password '+q(password)+';create schema auth authorization supabase_auth_admin;'+
      'create schema extensions;create extension pgcrypto with schema extensions;create extension "uuid-ossp" with schema extensions;'+
      'grant usage on schema public,auth,extensions to anon,authenticated,service_role,supabase_auth_admin;'+
      'alter role supabase_auth_admin set search_path=auth,public,extensions;'+
      'create role supabase_storage_admin login noinherit bypassrls password '+q(password)+';'+
      'create schema storage authorization supabase_storage_admin;'+
      'grant anon,authenticated,service_role to supabase_storage_admin;'+
      'grant usage on schema storage to anon,authenticated,service_role;'+
      'alter default privileges for role supabase_storage_admin in schema storage grant all on tables to anon,authenticated,service_role;'+
      'alter default privileges for role supabase_storage_admin in schema storage grant all on sequences to anon,authenticated,service_role;'+
      'alter default privileges for role supabase_storage_admin in schema storage grant all on functions to anon,authenticated,service_role;'+
      'grant usage on schema public,auth,extensions to supabase_storage_admin;'+
      'alter role supabase_storage_admin set search_path=storage,public,extensions;'+
      'grant all on schema public to service_role;')
    container('auth','128m',{
      GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:'9999',API_EXTERNAL_URL:siteOrigin+'/auth/v1',
      GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:'postgres://supabase_auth_admin:'+password+'@db:5432/postgres',
      GOTRUE_SITE_URL:siteOrigin,GOTRUE_DISABLE_SIGNUP:'true',GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',
      GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_JWT_AUD:'authenticated',
      GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_EXP:'3600',GOTRUE_JWT_SECRET:secret,
    })
    const auth=await serviceRelay('auth',9999,dockerPrefix,applicationDatabase?names[1]:names[0]);relays.push(auth)
    await waitHealthy(auth,'/health','Local GoTrue')
    if(!applicationDatabase)sql("create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid$$;"+
      "create or replace function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb->>'role'$$;"+
      "grant execute on all functions in schema auth to anon,authenticated,service_role,supabase_storage_admin;"+
      "grant select,references on auth.users to supabase_storage_admin;")
    container('rest','80m',{PGRST_DB_URI:'postgres://authenticator:'+password+'@db:5432/postgres',PGRST_DB_SCHEMAS:'public',
      PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret,PGRST_DB_POOL:'4'})
    const rest=await serviceRelay('rest',3000,dockerPrefix,applicationDatabase?names[1]:names[0]);relays.push(rest)
    await waitHealthy(rest,'/','Local PostgREST')
    container('storage','384m',{
      ANON_KEY:anonKey,SERVICE_KEY:serviceKey,
      AUTH_JWT_SECRET:secret,POSTGREST_URL:'http://rest:3000',
      DATABASE_URL:'postgres://supabase_storage_admin:'+password+'@db:5432/postgres',
      PGOPTIONS:'-c search_path=storage,public,extensions',
      DATABASE_POOL_MAX:'4',STORAGE_BACKEND:'file',
      FILE_STORAGE_BACKEND_PATH:'/var/lib/storage',GLOBAL_S3_BUCKET:'stub',
      TENANT_ID:'fixture',REGION:'local',FILE_SIZE_LIMIT:String(applicationDatabase?10*1024*1024:2*1024*1024),
      ENABLE_IMAGE_TRANSFORMATION:'false',
    },persistent?['--mount','type=volume,source='+id+'-storage-data,target=/var/lib/storage']:['--tmpfs','/var/lib/storage:rw,nosuid,size=64m'])
    const storage=await serviceRelay('storage',5000,dockerPrefix,applicationDatabase?names[1]:names[0]);relays.push(storage)
    await waitHealthy(storage,'/status','Local Supabase Storage')
    assert.equal(sql("select relrowsecurity from pg_class where oid='storage.objects'::regclass"),'t',
      'Real isolated Storage objects RLS must be enabled')
    // Next.js layout and Studio load several owner-scoped resources concurrently.
    // Keep the original eight active gateway slots, but wait briefly for a free
    // slot rather than returning a transient 429 during normal cold navigation.
    // A bounded FIFO and deadline preserve the existing overload protection.
    let inFlight=0
    const waiters=[]
    function acquireSlot(){
      if(inFlight<8&&waiters.length===0){inFlight++;return Promise.resolve(true)}
      if(waiters.length>=64)return Promise.resolve(false)
      return new Promise(resolve=>{
        let settled=false
        const enter=()=>{
          if(settled)return
          settled=true
          clearTimeout(timer)
          inFlight++
          resolve(true)
        }
        const timer=setTimeout(()=>{
          if(settled)return
          settled=true
          const index=waiters.indexOf(enter)
          if(index>=0)waiters.splice(index,1)
          resolve(false)
        },15000)
        waiters.push(enter)
      })
    }
    function releaseSlot(){
      inFlight--
      const next=waiters.shift()
      if(next)next()
    }
    gateway=httpServer(async(req,res)=>{
      if(!(await acquireSlot()))return res.writeHead(429,{'connection':'close'}).end()
      try{
        const browserOrigin=applicationDatabase&&typeof req.headers.origin==='string'&&browserOrigins.has(req.headers.origin)?req.headers.origin:null
        if(!gatewayOrigin||!matchesOrigin(req,gatewayOrigin)||(req.headers.origin&&!browserOrigin)||
           (![anonKey,serviceKey].includes(req.headers.apikey)&&!(browserOrigin&&req.method==='OPTIONS')))return res.writeHead(403,{'connection':'close'}).end()
        if(browserOrigin&&req.method==='OPTIONS'){res.writeHead(204,{'access-control-allow-origin':browserOrigin,'access-control-allow-headers':'authorization,apikey,content-type,x-client-info,x-supabase-api-version','access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS','vary':'Origin'}).end();return}
        const u=new URL(req.url,gatewayOrigin)
        const prefix=['/auth/v1','/rest/v1','/storage/v1'].find(p=>u.pathname===p||u.pathname.startsWith(p+'/'))
        if(!prefix)return res.writeHead(404).end()
        const relay=prefix==='/auth/v1'?auth:prefix==='/storage/v1'?storage:rest
        const headers={}
        for(const key of ['authorization','apikey','content-type','accept','prefer','x-client-info','x-supabase-api-version','x-upsert','cache-control','range']){
          if(req.headers[key])headers[key]=String(req.headers[key])
        }
        const body=await bodyBytes(req)
        if(body)headers['content-length']=String(body.length)
        const reply=await relay.exchange((u.pathname.slice(prefix.length)||'/')+u.search,req.method,headers,body)
        const outgoing={'cache-control':'no-store','x-content-type-options':'nosniff',...(browserOrigin?{'access-control-allow-origin':browserOrigin,'vary':'Origin'}:{})}
        for(const name of ['content-type','content-range','preference-applied']){
          const value=reply.headers[name];if(value)outgoing[name]=value
        }
        res.writeHead(reply.status,outgoing).end(reply.bytes)
      }catch(error){if(!res.headersSent)res.writeHead(error instanceof RangeError?413:502,{'connection':'close'});res.end()}finally{releaseSlot()}
    })
    gateway.requestTimeout=25000
    gatewayOrigin=await listenLocally(gateway,options.gatewayPort??0)
    return {url:gatewayOrigin,anonKey,serviceKey,sql,close,storage:true,id,images,docker:(args,input,raw=false)=>docker(args,input,{raw})}
  }catch(error){await close();throw error}
}
