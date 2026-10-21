/**
 * Atlas Creative P19 - compiled hard kill-switch.
 * HTTP headers, environment, JWT, or model output cannot turn on a route.
 */
export const CREATIVE_REVIEW_ROUTE_ENABLED=false;
export const CREATIVE_REVIEW_ROUTE_SCHEMA='omnira.creative.review.route.v1';

function disabledResponse(){
 return new Response(JSON.stringify({
  status:'creative_review_unavailable',
  workerIdentityActivated:false,
  executionAuthorized:false,publishAuthorized:false,
 }),{
  status:503,headers:{
   'content-type':'application/json; charset=utf-8',
   'cache-control':'no-store, max-age=0',
   'x-content-type-options':'nosniff',
  }
 });
}

/** The loader cannot run while the compiled gate is false. */
export async function handleDormantCreativeReviewRoute(request,loadLiveHandler) {
 if(!CREATIVE_REVIEW_ROUTE_ENABLED) return disabledResponse();
 // This branch is unreachable until independently reviewed code changes.
 if(request?.method!=='GET'&&request?.method!=='POST')return disabledResponse();
 if(typeof loadLiveHandler!=='function')return disabledResponse();
 try{
  const handler=await loadLiveHandler();
  if(typeof handler!=='function')return disabledResponse();
  const result=await handler(request);
  return result instanceof Response?result:disabledResponse();
 }catch{return disabledResponse()}
}
