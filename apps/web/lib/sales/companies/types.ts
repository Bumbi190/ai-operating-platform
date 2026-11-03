import type {SalesContact} from '../types'
import type {HistoryEvent,TimingReport} from '../timing/types'
import type {ArchiveReview} from '../../handlarborsen/lead-finder/research-archive'
import type {SavedCandidates} from '../../handlarborsen/lead-finder/saved-candidates'
import type {PublicBusiness} from '../discovery/types'

export type SourceState='ready'|'disabled'|'unavailable'|'incomplete'|'empty'
export type ContactsRead={status:SourceState;contacts:SalesContact[]}
export type CompanySource={key:string;label:string;state:SourceState;observedAt:string|null;note:string}
export type CompanyEvent={id:string;occurredAt:string;outboundAt:string|null;inboundAt:string|null;outcomes:HistoryEvent['outcome'][];kinds:HistoryEvent['kind'][];outbound:boolean;inbound:boolean}
export type CompanyRow={id:string;name:string;branch:string;city:string|null;orgnr:string|null;email:string|null;websiteUrl:string|null;sourceUrl:string|null;sourceLabel:string;sourceObservedAt:string|null;contactId:string|null;blocked:boolean;searchArea:string|null;status:'contacted'|'unknown'|'no_match';badges:string[];matches:string[];gaps:string[];events:CompanyEvent[];lastOutboundAt:string|null;lastInboundAt:string|null;earliestReviewAt:string|null;reviewNote:string|null;offerLabel:string|null;dialogContext:string|null}
export type CompanyDirectory={projectId:string;evaluatedAt:string;rows:CompanyRow[];sources:CompanySource[];uniqueRecipients:number|null;readOnly:true;sourceConfigured:boolean}
export type CompanyInput={projectId:string;evaluatedAt:string;contacts:ContactsRead;timing:TimingReport|null;archive:ArchiveReview;saved:SavedCandidates;sourceConfigured:boolean;publicResults?:{candidates:PublicBusiness[];retrievedAt:string;city:string;radiusKm?:number}}
export type CompanyFilters={query:string;area:string;status:string}
