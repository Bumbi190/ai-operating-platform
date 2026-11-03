import type {CompanyFilters,CompanyRow} from './types'
export function filterCompanies(rows:CompanyRow[],filters:CompanyFilters):CompanyRow[]{
 const q=filters.query.trim().toLocaleLowerCase('sv-SE'),area=filters.area.trim().toLocaleLowerCase('sv-SE')
 return rows.filter(r=>(!q||[r.name,r.branch,r.email,r.orgnr].some(v=>v?.toLocaleLowerCase('sv-SE').includes(q)))&&(!area||[r.city,r.branch].some(v=>v?.toLocaleLowerCase('sv-SE').includes(area)))&&(filters.status==='all'||filters.status==='blocked'&&r.blocked||filters.status===r.status))
}
