import http from 'node:http';
const PATHS=new Set(['/api/version','/api/tags','/api/show','/api/chat','/api/ps','/api/generate']);
export class LocalError extends Error {
  constructor(code,details={}) {super(code);this.code=code;Object.assign(this,details);}
}
/** Internal transport factory for controlled local services. Never configured from jobs or env. */
export function createLoopbackTransport(port=11434) {
  if(!Number.isInteger(port)||port<1||port>65535) throw new LocalError('INVALID_REQUEST');
  return function request({path,method='GET',body,timeoutMs=3000,maxBytes=131072,signal}) {
    if(!PATHS.has(path)||!['GET','POST'].includes(method)||!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>90000||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>131072) throw new LocalError('INVALID_REQUEST');
    return new Promise((resolve,reject)=>{
      let settled=false,dispatched=false,complete=false,req;
      const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(error){req?.destroy();reject(error);}else resolve(value);};
      const fail=(code,extra={})=>finish(new LocalError(code,{dispatched,complete,...extra}));
      const abort=()=>fail('LOCAL_ABORTED');
      const timer=setTimeout(()=>fail('LOCAL_TIMEOUT'),timeoutMs);
      if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});
      const bytes=body===undefined?undefined:Buffer.from(JSON.stringify(body),'utf8');
      req=http.request({host:'127.0.0.1',port,path,method,agent:false,headers:bytes?{'Content-Type':'application/json','Content-Length':bytes.length}:{}},res=>{
        let total=0;const chunks=[];
        if(res.statusCode!==200){res.resume();fail('HTTP_STATUS',{status:res.statusCode,complete:true,definite:res.statusCode>=400&&res.statusCode<500});return;}
        res.on('data',c=>{total+=c.length;if(total>maxBytes){fail('RESPONSE_TOO_LARGE');res.destroy();}else chunks.push(c);});
        res.on('aborted',()=>fail('INCOMPLETE_RESPONSE'));
        res.on('error',()=>fail('LOCAL_NETWORK'));
        res.on('end',()=>{if(settled)return;complete=true;try{finish(null,JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{fail('INVALID_JSON');}});
      });
      req.on('finish',()=>{dispatched=true;});req.on('error',()=>fail('LOCAL_NETWORK'));req.end(bytes);
    });
  };
}
export const requestLoopback=createLoopbackTransport();
