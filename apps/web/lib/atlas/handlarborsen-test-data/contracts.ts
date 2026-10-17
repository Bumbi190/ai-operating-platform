export const HANDLARBORSEN_PROJECT_ID='8f673c09-1c8f-4d78-876e-4c14bf1c89b3'
export const HANDLARBORSEN_TEST_DATA_URL='https://www.handlarborsen.se/api/internal/atlas-test-data'
export const HANDLARBORSEN_TEST_DATA_PATH='/api/internal/atlas-test-data'
export type Operation='quarantine'|'restore'
export type CleanupScope={projectId:string;conversationId:string;operation?:Operation}
export function isUuid(value:unknown):value is string{return typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)}
export function isObject(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value)}
export function exactKeys(value:Record<string,unknown>,keys:readonly string[]):boolean{return Object.keys(value).sort().join('|')===[...keys].sort().join('|')}

export type Counts=Partial<Record<(typeof OBJECT_KINDS)[number],number>>
export type Blocker={code:(typeof BLOCKER_CODES)[number];organisationId:string}
export type PackageView={packageId:string;projectId:string;conversationId:string;operatorBindingId:string;operation:Operation;organisationIds:string[];classificationRevision:string;graphSha256:string;expiresAt:string;counts:Counts;blockers:Blocker[];status:'prepared'|'blocked'}
export type PreparationResult=PackageView|{status:'nothing_to_do'}
export type ReceiptView={packageId:string;executionId:string;operation:Operation;outcome:'applied'|'needs_new_review';beforeSha256:string;afterSha256:string;counts:Counts;committedAt:string|null}
export type InventoryOrganisation={organisationId:string;name:string;classification:'unknown'|'real'|'verified_test';revision:number;counts:Counts;blockers:Blocker[]}
export type InventoryView={schemaVersion:1;observedAt:string;organisations:InventoryOrganisation[];nextCursor:string|null}
export type IntegrationRequest=
 |{action:'inventory';payload:{cursor?:string}}
 |{action:'prepare';payload:{organisationIds:string[];operation:Operation}}
 |{action:'execute';payload:{packageId:string;approvalRef:string;executionId:string;idempotencyKey:string;approvedPackage:PackageView}}
 |{action:'receipt';payload:{executionId:string}}
export type IntegrationResponse=
 |{status:'ok';action:'inventory';data:InventoryView}
 |{status:'ok';action:'prepare';data:PreparationResult}
 |{status:'ok';action:'execute'|'receipt';data:ReceiptView|null}
 |{status:'denied'|'disabled'|'unavailable'|'needs_new_review'}
 |{status:'unknown';executionId:string}
const protectedIds=['23b45965-71f8-4e95-a4eb-32872234664d','d679116a-fc8f-4f80-85c5-1dbecfff8257']
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0
const digest=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
const timestamp=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(v)&&Number.isFinite(Date.parse(v))
const operation=(v:unknown):v is Operation=>v==='quarantine'||v==='restore'
function counts(v:unknown):v is Counts{return isObject(v)&&Object.entries(v).every(([k,n])=>(OBJECT_KINDS as readonly string[]).includes(k)&&count(n))}
function blockers(v:unknown):v is Blocker[]{return Array.isArray(v)&&v.length<=500&&v.every(b=>isObject(b)&&exactKeys(b,['code','organisationId'])&&(BLOCKER_CODES as readonly unknown[]).includes(b.code)&&isUuid(b.organisationId))}
function ids(v:unknown):v is string[]{return Array.isArray(v)&&v.length<=25&&v.every(isUuid)&&new Set(v).size===v.length}
export function decodePackageView(v:unknown):PackageView|null{
 if(!isObject(v)||!exactKeys(v,['packageId','projectId','conversationId','operatorBindingId','operation','organisationIds','classificationRevision','graphSha256','expiresAt','counts','blockers','status'])||
 !isUuid(v.packageId)||v.projectId!==HANDLARBORSEN_PROJECT_ID||!isUuid(v.conversationId)||!isUuid(v.operatorBindingId)||!operation(v.operation)||
 !ids(v.organisationIds)||v.organisationIds.length<1||v.organisationIds.some((id,i,a)=>i>0&&id<=a[i-1])||
 !digest(v.classificationRevision)||!digest(v.graphSha256)||!timestamp(v.expiresAt)||!counts(v.counts)||v.counts.organizations!==v.organisationIds.length||
 !blockers(v.blockers)||(v.status!=='prepared'&&v.status!=='blocked')||(v.status==='prepared')!==(v.blockers.length===0)||
 v.blockers.some(b=>!(v.organisationIds as string[]).includes(b.organisationId))||(v.status==='prepared'&&v.organisationIds.some(id=>protectedIds.includes(id))))return null
 return v as PackageView
}
export function decodePreparationResult(v:unknown):PreparationResult|null{
 if(isObject(v)&&exactKeys(v,['status'])&&v.status==='nothing_to_do')return {status:'nothing_to_do'}
 return decodePackageView(v)
}
export function decodeReceiptView(v:unknown):ReceiptView|null{
 if(!isObject(v)||!exactKeys(v,['packageId','executionId','operation','outcome','beforeSha256','afterSha256','counts','committedAt'])||
 !isUuid(v.packageId)||!isUuid(v.executionId)||!operation(v.operation)||(v.outcome!=='applied'&&v.outcome!=='needs_new_review')||
 !digest(v.beforeSha256)||!digest(v.afterSha256)||!counts(v.counts)||(v.committedAt!==null&&!timestamp(v.committedAt))||
 (v.outcome==='applied')!==(v.committedAt!==null))return null
 return v as ReceiptView
}
export function decodeInventoryView(v:unknown):InventoryView|null{
 if(!isObject(v)||!exactKeys(v,['schemaVersion','observedAt','organisations','nextCursor'])||v.schemaVersion!==1||!timestamp(v.observedAt)||
 !Array.isArray(v.organisations)||v.organisations.length>25||(v.nextCursor!==null&&!isUuid(v.nextCursor)))return null
 const seen=new Set<string>()
 for(const row of v.organisations){
  if(!isObject(row)||!exactKeys(row,['organisationId','name','classification','revision','counts','blockers'])||
   !isUuid(row.organisationId)||seen.has(row.organisationId)||typeof row.name!=='string'||row.name.length<1||row.name.length>1000||
   !['unknown','real','verified_test'].includes(String(row.classification))||!count(row.revision)||!counts(row.counts)||!blockers(row.blockers)||
   (protectedIds.includes(row.organisationId)&&row.classification!=='real'))return null
  seen.add(row.organisationId)
 }
 return v as InventoryView
}
export function decodeIntegrationRequest(v:unknown):IntegrationRequest|null{
 if(!isObject(v)||!exactKeys(v,['action','payload'])||!isObject(v.payload))return null
 const p=v.payload
 if(v.action==='inventory'&&Object.keys(p).every(k=>k==='cursor')&&(p.cursor===undefined||isUuid(p.cursor)))return v as IntegrationRequest
 if(v.action==='prepare'&&exactKeys(p,['organisationIds','operation'])&&ids(p.organisationIds)&&!p.organisationIds.some(id=>protectedIds.includes(id))&&operation(p.operation))return {action:'prepare',payload:{organisationIds:[...p.organisationIds].sort(),operation:p.operation}}
 if(v.action==='receipt'&&exactKeys(p,['executionId'])&&isUuid(p.executionId))return v as IntegrationRequest
 if(v.action==='execute'&&exactKeys(p,['packageId','approvalRef','executionId','idempotencyKey','approvedPackage'])&&[p.packageId,p.approvalRef,p.executionId,p.idempotencyKey].every(isUuid)){
  const approved=decodePackageView(p.approvedPackage)
  if(approved?.status==='prepared'&&approved.packageId===p.packageId)return {action:'execute',payload:{packageId:p.packageId as string,approvalRef:p.approvalRef as string,executionId:p.executionId as string,idempotencyKey:p.idempotencyKey as string,approvedPackage:approved}}
 }
 return null
}
export function canonicalCleanupJson(v:unknown):string{
 if(Array.isArray(v))return '['+v.map(canonicalCleanupJson).join(',')+']'
 if(isObject(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonicalCleanupJson(v[k])).join(',')+'}'
 return JSON.stringify(v)
}

export const OBJECT_KINDS = [
  "organizations",
  "profiles",
  "organization_members",
  "organization_invitations",
  "vehicles",
  "vehicle_images",
  "vehicle_reports",
  "vehicle_damages",
  "vehicle_service_records",
  "vehicle_tires",
  "auctions",
  "bids",
  "interests",
  "offers",
  "deals",
  "conversations",
  "conversation_messages",
  "conversation_read_state",
  "conversation_visibility",
  "notifications",
  "admin_reviews",
  "risk_flags",
  "publication_checks",
  "audit_logs",
  "subscriptions",
  "activity_archives",
  "admin_email_events",
  "admin_email_deliveries",
  "push_subscriptions",
  "push_deliveries",
  "stripe_billing_operations",
  "stripe_seat_sync_jobs",
  "stripe_subscription_items",
  "stripe_webhook_events",
  "vehicle_equipment_report_requests",
  "vehicle_lookup_quota_events",
] as const;

export const BLOCKER_CODES = [
  "protected_organisation",
  "unknown_classification",
  "real_classification",
  "organisation_unavailable",
  "external_counterparty",
  "unverified_object",
  "shared_identity",
  "platform_identity",
  "stripe_link",
  "external_dispatch_in_flight",
  "unsupported_schema",
  "already_quarantined",
  "not_quarantined",
  "closed_organisation",
  "restore_receipt_unavailable",
] as const;
