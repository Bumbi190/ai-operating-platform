// Test-only fixed-upstream HTTP transport. No caller-selected host, execution or credentials.
export const BROWSER_PROXY_CODE='('+function(){
 const http=require('node:http');
 for(const [listen,upstream] of [[54393,54393],[54394,3100]]){
  http.createServer((req,res)=>{
   if(!req.url?.startsWith('/')){res.writeHead(400).end();return;}
   const headers={...req.headers};delete headers.connection;
   const next=http.request({hostname:'client',port:upstream,path:req.url,method:req.method,headers},response=>{
    const out={...response.headers};
    // Translate only this backend's internal redirect origin to its loopback frontend.
    if(listen===54394&&out.location){try{const u=new URL(out.location);if(['localhost','0.0.0.0','127.0.0.1','client'].includes(u.hostname)&&u.port==='3100'){u.host='127.0.0.1:54394';out.location=u.href;}}catch{}}
    res.writeHead(response.statusCode??502,out);response.pipe(res);
   });
   next.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});
   req.pipe(next);
  }).listen(listen,'0.0.0.0');
 }
}.toString()+')()';
