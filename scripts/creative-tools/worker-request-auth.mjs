/**
 * Creative worker P10: offline signature verification + durable replay hook.
 * Does NOT enroll a worker, open a route, issue permission, run media or
 * reuse the code-work broker's repository identity.
 * A trusted host MUST inject a server-owned registry and transactionally
 * durable consumeVerifiedProof() store. No in-memory fallback in production.
 */
import {createHash,createPublicKey,verify} from 'node:crypto';

const REQUEST_DOMAIN='omnira.creative.worker.request.v1';
export const CREATIVE_CLAIM_PATH='/api/atlas/creative/worker/claim';
const WORKER=/^[A-Za-z][A-Za-z0-9_-]{2,63}$/;
const B64=/^[A-Za-z0-9_-]{22,64}$/;
const P1363=/^[A-Za-z0-9_-]{86}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AGE_MS=60_000, MAX_FUTURE_MS=15_000;
const sha=x=>createHash('sha256').update(x).digest('hex');
const HEADERS={
 id:'x-omnira-creative-worker-id',
 key:'x-omnira-creative-key-id',
 counter:'x-omnira-creative-counter',
 nonce:'x-omnira-creative-nonce',
 timestamp:'x-omnira-creative-timestamp',
 signature:'x-omnira-creative-signature'
};
export function canonicalCreativeWorkerRequest(proof) {
  if(!proof || typeof proof!=='object' || Array.isArray(proof) ||
    !WORKER.test(proof.workerId) || !WORKER.test(proof.keyId) ||
    !Number.isSafeInteger(proof.counter) || proof.counter<1 ||
    !B64.test(proof.nonce) ||
    typeof proof.timestamp!=='string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(proof.timestamp) ||
    !Number.isFinite(Date.parse(proof.timestamp)) ||
    new Date(proof.timestamp).toISOString()!==proof.timestamp ||
    proof.method!=='POST' || proof.path!==CREATIVE_CLAIM_PATH ||
    typeof proof.bodySha256!=='string' || !/^[a-f0-9]{64}$/.test(proof.bodySha256)) {
    throw new Error('invalid creative signed request fields');
  }
  return [
    REQUEST_DOMAIN,
    'worker_id:'+proof.workerId,'key_id:'+proof.keyId,
    'counter:'+proof.counter,'nonce:'+proof.nonce,
    'timestamp:'+proof.timestamp,'method:POST',
    'path:'+CREATIVE_CLAIM_PATH,'body_sha256:'+proof.bodySha256,
  ].join('\n');
}
export function readCreativeWorkerHeaders(request,rawBody) {
  if(!request || typeof rawBody!=='string' ||
    request.method!=='POST') return null;
  const url=new URL(request.url);
  // No aliases, query parameters, alternate origin-relative paths or fragments.
  if(url.pathname!==CREATIVE_CLAIM_PATH || url.search || url.hash ||
    url.username || url.password) return null;
  const vals=Object.fromEntries(Object.entries(HEADERS)
    .map(([field,header])=>[field,request.headers.get(header)]));
  if(!vals.id || !vals.key || !vals.counter || !vals.nonce ||
    !vals.timestamp || !vals.signature ||
    !/^[1-9]\d{0,14}$/.test(vals.counter) || !P1363.test(vals.signature)) return null;
  const proof={
    workerId:vals.id,keyId:vals.key,counter:Number(vals.counter),
    nonce:vals.nonce,timestamp:vals.timestamp,
    method:'POST',path:CREATIVE_CLAIM_PATH,bodySha256:sha(Buffer.from(rawBody,'utf8'))
  };
  try {canonicalCreativeWorkerRequest(proof)} catch {return null}
  const signature=Buffer.from(vals.signature,'base64url');
  if(signature.length!==64 || signature.toString('base64url')!==vals.signature) return null;
  return Object.freeze({...proof,signature:vals.signature});
}
/**
 * Registry returns immutable active record incl. *trusted* public key and
 * project permissions (UUIDs only). Store must lock that same identity and
 * verify key generation/revocation while atomically enforcing nonce+counter.
 * Request header identity is merely a lookup selector, never authority.
 */
export function makeCreativeWorkerAuthenticator({registry,store,now=()=>new Date()}) {
  if(!registry || typeof registry.getWorker!=='function' ||
    !store || typeof store.consumeVerifiedProof!=='function' ||
    typeof now!=='function') throw new Error('trusted creative authenticator dependencies missing');
  return async function authenticateCreativeWorker(request,rawBody) {
    try {
      const proof=readCreativeWorkerHeaders(request,rawBody);
      if(!proof) return null;
      const nowMs=now().getTime(),sent=Date.parse(proof.timestamp);
      if(!Number.isFinite(nowMs) || nowMs-sent>MAX_AGE_MS ||
        sent-nowMs>MAX_FUTURE_MS) return null;
      const identity=await registry.getWorker(proof.workerId);
      if(!identity || identity.workerId!==proof.workerId ||
        identity.keyId!==proof.keyId ||
        identity.state!=='active' ||
        identity.creativeClaimEnabled!==true ||
        !Array.isArray(identity.projectIds) ||
        identity.projectIds.length<1 || identity.projectIds.length>32 ||
        identity.projectIds.some(x=>typeof x!=='string' || !UUID.test(x)) ||
        new Set(identity.projectIds).size!==identity.projectIds.length ||
        !identity.publicKey) return null;
      const publicKey=createPublicKey(identity.publicKey);
      if(publicKey.asymmetricKeyType!=='ec' ||
        publicKey.asymmetricKeyDetails?.namedCurve!=='prime256v1') return null;
      if(!verify('sha256',Buffer.from(canonicalCreativeWorkerRequest(proof)),
        {key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(proof.signature,'base64url'))) return null;
      // Identity+key ID and exact counter/nonce are checked inside the
      // trusted transactional store *after* signature and registry lookup.
      // The store MUST revalidate active/revoked/project membership under
      // the lock and consume only when counter grows AND nonce is unique.
      const accepted=await store.consumeVerifiedProof({
        workerId:identity.workerId,keyId:identity.keyId,
        counter:proof.counter,nonceHash:sha(REQUEST_DOMAIN+'\n'+proof.workerId+'\n'+proof.nonce),
        requiredCapability:'creative.queue.claim',
        projectIds:[...identity.projectIds]
      });
      if(accepted!==true) return null;
      return Object.freeze({
        authenticated:true,creativeCapability:true,
        workerId:identity.workerId,allowedProjectIds:Object.freeze([...identity.projectIds])
      });
    } catch {return null}
  };
}
