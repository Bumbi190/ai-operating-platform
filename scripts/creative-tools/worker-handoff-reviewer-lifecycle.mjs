/**
 * READ ONLY governance/revocation journal for a proposed Creative reviewer
 * registry. A separately pinned (registry digest, journal head, sequence)
 * must come from an actual external administrative trust channel.
 *
 * This module deliberately cannot enroll users, rotate keys, re-activate a
 * suspended reviewer, sign events, write storage, or authorize installation.
 * Its event builder is TEST DATA ONLY and does not confer authority.
 */
import {createHash} from 'node:crypto';
import {fingerprintCreativeReviewerRegistry,inspectPinnedCreativeReviewer} from './worker-handoff-reviewer-registry.mjs';

const H=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z][A-Za-z0-9_-]{2,63}$/;
const DATE=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
export const LIFECYCLE_SCHEMA='omnira.creative.reviewer_lifecycle.v1';
const digest=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
function exact(o,keys,label){
 if(!o||typeof o!=='object'||Array.isArray(o)||
  Object.keys(o).length!==keys.length||
  Object.keys(o).some(k=>!keys.includes(k)))throw Error(label+'_fields_invalid');
}
function baseSha(registrySha256){
 return digest('omnira.creative.reviewer.lifecycle.genesis.v1\n'+registrySha256);
}
function sealEvent({sequence,previousSha256,reviewerId,action,actorId,occurredAt}){
 const unsigned={sequence,previousSha256,reviewerId,action,actorId,occurredAt};
 return {...unsigned,eventSha256:digest('omnira.creative.reviewer.lifecycle.event.v1\n'+JSON.stringify(unsigned))};
}
export function createTestReviewerLifecycle(registry){
 const registrySha256=fingerprintCreativeReviewerRegistry(registry);
 return {schema:LIFECYCLE_SCHEMA,registrySha256,events:[],headSha256:baseSha(registrySha256)};
}
function validateEvent(event,expectedSequence,previousSha256){
 exact(event,['sequence','previousSha256','reviewerId','action','actorId','occurredAt','eventSha256'],
  'lifecycle_event');
 if(!Number.isSafeInteger(event.sequence)||event.sequence!==expectedSequence||
   typeof event.previousSha256!=='string'||event.previousSha256!==previousSha256||
   typeof event.eventSha256!=='string'||!H.test(event.eventSha256)||
   typeof event.reviewerId!=='string'||!ID.test(event.reviewerId)||
   typeof event.actorId!=='string'||!ID.test(event.actorId)||
   event.actorId===event.reviewerId||
   !['suspend','revoke'].includes(event.action)||
   typeof event.occurredAt!=='string'||!DATE.test(event.occurredAt)||
   !Number.isFinite(Date.parse(event.occurredAt))){
  throw Error('reviewer_lifecycle_event_invalid');
 }
 const expected=sealEvent(event);
 if(expected.eventSha256!==event.eventSha256)throw Error('reviewer_lifecycle_chain_tampered');
}
/**
 * Pure creation of a TEST event. Production would require a separately signed,
 * independently authenticated operator action + durable protected journal.
 */
export function appendTestReviewerLifecycleEvent(journal,attrs){
 exact(journal,['schema','registrySha256','events','headSha256'],'reviewer_lifecycle');
 if(journal.schema!==LIFECYCLE_SCHEMA||!Array.isArray(journal.events)||
   journal.events.length>64||!H.test(journal.registrySha256)||!H.test(journal.headSha256)){
  throw Error('reviewer_lifecycle_journal_malformed');
 }
 const last=journal.events.at(-1);
 const prev=last?last.eventSha256:baseSha(journal.registrySha256);
 if(prev!==journal.headSha256)throw Error('reviewer_lifecycle_head_mismatch');
 exact(attrs,['reviewerId','action','actorId','occurredAt'],'test_event');
 const sequence=journal.events.length+1;
 const event=sealEvent({sequence,previousSha256:prev,...attrs});
 return {schema:LIFECYCLE_SCHEMA,registrySha256:journal.registrySha256,
  events:[...journal.events,event],headSha256:event.eventSha256};
}
/**
 * Verifies an externally pinned full history. This verification proves only
 * consistency of supplied data against supplied pins, not who set the pins.
 */
export function inspectPinnedReviewerLifecycle({
 registry,journal,externallyPinnedRegistrySha256,
 externallyPinnedHeadSha256,minimumSequence,
}){
 if(typeof externallyPinnedRegistrySha256!=='string'||!H.test(externallyPinnedRegistrySha256)||
    typeof externallyPinnedHeadSha256!=='string'||!H.test(externallyPinnedHeadSha256)||
    !Number.isSafeInteger(minimumSequence)||minimumSequence<0||minimumSequence>64){
  throw Error('external_lifecycle_pins_required');
 }
 if(fingerprintCreativeReviewerRegistry(registry)!==externallyPinnedRegistrySha256){
  throw Error('lifecycle_registry_external_pin_mismatch');
 }
 exact(journal,['schema','registrySha256','events','headSha256'],'reviewer_lifecycle');
 if(journal.schema!==LIFECYCLE_SCHEMA||
   journal.registrySha256!==externallyPinnedRegistrySha256||
   !Array.isArray(journal.events)||journal.events.length>64||
   journal.events.length<minimumSequence){
  throw Error('stale_or_invalid_review_history');
 }
 const reviewers=registry?.reviewers;
 if(!Array.isArray(reviewers)||reviewers.length===0||reviewers.length>8){
  throw Error('reviewer_registry_invalid');
 }
 const projected=new Map();
 for(const r of reviewers){
  if(!r||typeof r.reviewerId!=='string'||!ID.test(r.reviewerId)||
     !['active','suspended','revoked'].includes(r.status)||projected.has(r.reviewerId)){
   throw Error('reviewer_registry_invalid');
  }
  projected.set(r.reviewerId,r.status);
 }
 let current=baseSha(externallyPinnedRegistrySha256);
 let lastTime=-Infinity;
 for(let i=0;i<journal.events.length;i++){
  const event=journal.events[i];
  validateEvent(event,i+1,current);
  const nextTime=Date.parse(event.occurredAt);
  if(nextTime<lastTime)throw Error('reviewer_lifecycle_time_rollback');
  lastTime=nextTime;
  const old=projected.get(event.reviewerId);
  if(old===undefined)throw Error('reviewer_lifecycle_unknown_reviewer');
  if(old==='revoked'||old===event.action.replace('revoke','revoked').replace('suspend','suspended')){
   throw Error('reviewer_lifecycle_invalid_transition');
  }
  if(event.action==='suspend'&&old!=='active')throw Error('reviewer_lifecycle_invalid_transition');
  if(event.action==='revoke'&&!['active','suspended'].includes(old)){
   throw Error('reviewer_lifecycle_invalid_transition');
  }
  projected.set(event.reviewerId,event.action==='revoke'?'revoked':'suspended');
  current=event.eventSha256;
 }
 if(current!==journal.headSha256||current!==externallyPinnedHeadSha256){
  throw Error('reviewer_lifecycle_head_not_independently_pinned');
 }
 const reviewerStatuses=Object.freeze(Object.fromEntries(projected));
 return Object.freeze({
  schema:'omnira.creative.lifecycle_inspection.v1',
  status:'history_matches_supplied_pins_not_identity_or_copy_authority',
  registrySha256:externallyPinnedRegistrySha256,
  headSha256:current,sequence:journal.events.length,
  reviewerStatuses,
  identityAuthorityVerified:false,
  externalPinAuthenticityVerified:false,
  nonceConsumed:false,copyAuthorized:false,
  installerAuthorized:false,workerExecutionEnabled:false,productionReady:false,
 });
}

/**
 * Compose trusted EXTERNAL registry/head pins with a signed review. An event
 * history with a revoked/suspended reviewer denies an otherwise valid proof.
 * The resulting check remains an inert TEST/PLANNING result.
 */
export function inspectLifecycleBoundCreativeReview({
 registry,journal,externallyPinnedRegistrySha256,externallyPinnedHeadSha256,
 minimumSequence,reviewedCommitSha,reviewedManifestSha256,
 independentlyExpectedAuthorId,proof,manifest,now,
}){
 const lifecycle=inspectPinnedReviewerLifecycle({
  registry,journal,externallyPinnedRegistrySha256,
  externallyPinnedHeadSha256,minimumSequence,
 });
 const claimedReviewer=proof?.claims?.reviewerId;
 if(typeof claimedReviewer!=='string'||!Object.hasOwn(lifecycle.reviewerStatuses,claimedReviewer)||
    lifecycle.reviewerStatuses[claimedReviewer]!=='active'){
  throw Error('lifecycle_reviewer_not_active');
 }
 const effective={
  schema:registry.schema,repositoryId:registry.repositoryId,
  targetHost:registry.targetHost,
  reviewers:registry.reviewers.map(r=>({
   ...r,status:lifecycle.reviewerStatuses[r.reviewerId],
  })),
 };
 const checked=inspectPinnedCreativeReviewer({
  registry:effective,
  externallyPinnedRegistrySha256:fingerprintCreativeReviewerRegistry(effective),
  reviewedCommitSha,reviewedManifestSha256,
  independentlyExpectedAuthorId,proof,manifest,now,
 });
 return Object.freeze({
  schema:'omnira.creative.lifecycle_bound_review.v1',
  status:'review_signature_and_lifecycle_consistent_not_authorized',
  reviewerId:checked.reviewerId,
  commitSha:checked.commitSha,manifestSha256:checked.manifestSha256,
  headSha256:lifecycle.headSha256,sequence:lifecycle.sequence,
  cryptographicReviewValid:true,lifecycleChainMatchesPins:true,
  reviewerIdentityExternallyVerified:false,
  reviewerPermissionToCopy:false,nonceConsumed:false,
  productionLedgerVerified:false,bootstrapAuthorized:false,
  workerExecutionEnabled:false,productionReady:false,
 });
}
