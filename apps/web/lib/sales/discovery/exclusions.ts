import 'server-only'
import {HANDLARBORSEN_PROJECT_ID} from '@/lib/atlas/handlarborsen-test-data/contracts'
import {documentedPilotHistoryEntries} from '@/lib/handlarborsen/lead-finder/documented-pilot-history'
import {registeredAccountExclusions} from '@/lib/handlarborsen/lead-finder/registered-accounts-snapshot'
import {buildExclusionIndex,lookupExclusions} from '@/lib/handlarborsen/lead-finder/exclusions'
import {normalizeCompanyName,normalizeDomain} from '@/lib/handlarborsen/lead-finder/identity'
/** Prevention only. Empty matches never assert complete contact/account history. */
export function discoveryBaselineReasons(projectId:string,candidate:{name:string;websiteUrl:string|null}):string[]{
 if(projectId!==HANDLARBORSEN_PROJECT_ID)return []
 const index=buildExclusionIndex([...documentedPilotHistoryEntries(),...registeredAccountExclusions()])
 const reasons=new Set<string>(lookupExclusions(index,{orgnr:null,normalizedName:normalizeCompanyName(candidate.name)}))
 const domain=normalizeDomain(candidate.websiteUrl);if(domain)index.byDomain.get(domain)?.forEach(reason=>reasons.add(reason))
 return [...reasons].sort()
}
