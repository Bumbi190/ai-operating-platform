// Transparent HTTP forwarding only; no auth/database behavior is replaced.
import http from 'node:http'
let input=''
for await(const chunk of process.stdin)input+=chunk
const request=JSON.parse(input),path=request.path
const auth=path.startsWith('/auth/v1/'),rest=path.startsWith('/rest/v1/')
if(!auth&&!rest)throw Error('unknown local gateway path')
const outgoing=http.request({
 hostname:auth?'auth':'rest',port:auth?9999:3000,
 method:request.method,path:path.slice(8),
 headers:{...request.headers,host:auth?'auth:9999':'rest:3000'},
},response=>{
 const chunks=[]
 response.on('data',chunk=>chunks.push(chunk))
 response.on('end',()=>process.stdout.write(JSON.stringify({status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks).toString('base64')})))
})
outgoing.on('error',error=>{console.error(error.message);process.exitCode=1})
outgoing.end(Buffer.from(request.body,'base64'))
