import {WebsiteBuildError} from '../store'
import {municipalityByCode} from './municipalities'
export type CompanySearchQuery = {municipalityCode: string; category: 'car_dealer'; limit: 5}
export function companyQueryMunicipality(query: CompanySearchQuery) {return municipalityByCode(query.municipalityCode)}
export function parseCompanySearchQuery(value: unknown): CompanySearchQuery {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new WebsiteBuildError('INVALID_BODY')
  const q = value as Record<string, unknown>
  if (Object.keys(q).length !== 3 || Object.keys(q).some(k => !['municipalityCode','category','limit'].includes(k)) || !municipalityByCode(q.municipalityCode) || q.category !== 'car_dealer' || q.limit !== 5) throw new WebsiteBuildError('INVALID_BODY')
  return {municipalityCode: q.municipalityCode as string, category: 'car_dealer', limit: 5}
}
