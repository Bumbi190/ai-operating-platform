// Only the fixture's external storage boundary is substituted; production upload UI runs unchanged.
export function createClient(){
 if(location.origin!=='http://127.0.0.1:54406')throw Error('No real Supabase connection is permitted in this UI fixture')
 return {storage:{from:(bucket:string)=>({uploadToSignedUrl:async(path:string,token:string,file:File,options:{contentType:string;upsert:boolean})=>{
  const response=await fetch('/fixture/upload',{method:'POST',headers:{'content-type':options.contentType,'x-fixture-bucket':bucket,'x-fixture-path':path,'x-fixture-token':token,'x-fixture-upsert':String(options.upsert)},body:file})
  return {error:response.ok?null:Error('Fixture storage rejected upload')}
 }})}}
}
