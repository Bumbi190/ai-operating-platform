import type {OverviewPeriod,OverviewProject,ReadResult} from './types'
import type {HandlarborsenTraffic} from '@/lib/atlas/project-analytics/handlarborsen-posthog-traffic'
import type {PrincipalBriefResult} from '@/lib/atlas/intelligence/principal-read'
import type {HistoryServiceResult} from '@/lib/atlas/project-analytics/handlarborsen-competitor-history-service'

export type GrowthState='ready'|'missing'|'unavailable'|'partial'|'stale'|'waiting'
export type GrowthProject=Pick<OverviewProject,'id'|'name'|'slug'|'href'|'color'>
export type SocialPlatform='instagram'|'facebook'|'youtube'
export type SocialSourceRow={
  id:string;project_id:string;platform:string;snapshot_date:string;captured_at:string
  followers:unknown;reach:unknown
  account_id?:unknown;instagram_user_id?:unknown;youtube_channel_id?:unknown
}
export type WorkSourceRow={id:string;project_id:string;status:string;kind?:unknown;created_at:string}
export type GrowthPoint={date:string;value:number}
export type SocialSeries={
  projectId:string;projectName:string;platform:SocialPlatform;label:string
  state:GrowthState;followers:number|null;reach:number|null;lifetimeViews:number|null
  observedAt:string|null;points:GrowthPoint[];delta:number|null;fromDate:string|null;toDate:string|null
}
export type TrafficSeries={
  projectId:string;projectName:string;state:GrowthState;days:GrowthPoint[]
  totalPageviews:number|null;checkedAt:string|null;timezone:'UTC';period:OverviewPeriod
}
export type GrowthEvidence={label:string;observedAt:string}
export type GrowthRecommendation={
  id:string;projectId:string;projectName:string;projectHref:string
  kind:'analysis'|'measurement';title:string;reason:string;counterfactual:string|null
  defeater:string|null;confidence:number|null;evidence:GrowthEvidence[];observedAt:string|null
}
export type ProjectBrief={
  projectId:string;state:GrowthState;situation:string|null;producedAt:string|null
}
export type CompetitorSummary={
  projectId:string;sourceId:string;name:string;url:string;state:GrowthState
  checkedAt:string|null;changed:boolean;detail:string
}
export type OverviewWork={
  id:string;projectId:string;projectName:string;href:string;title:string
  status:string;statusLabel:string;createdAt:string;active:boolean
}
export type GrowthOverview={
  evaluatedAt:string;period:OverviewPeriod;traffic:TrafficSeries[];social:SocialSeries[]
  briefs:ProjectBrief[];recommendations:GrowthRecommendation[];competitors:CompetitorSummary[]
  work:ReadResult<OverviewWork>;coverage:{projects:number;web:number;social:number;analyses:number}
}
export type GrowthInput={
  projects:GrowthProject[];period:OverviewPeriod;now:Date
  social:ReadResult<SocialSourceRow>;work:ReadResult<WorkSourceRow>
  traffic:Record<string,HandlarborsenTraffic>;briefs:Record<string,PrincipalBriefResult>
  competitors:HistoryServiceResult
}
