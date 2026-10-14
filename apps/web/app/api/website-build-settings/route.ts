import {websiteBuilderSettingsApi} from '@/lib/website-build/planning/api'
export const dynamic='force-dynamic'
export async function GET(request:Request){return websiteBuilderSettingsApi(request)}
export async function POST(request:Request){return websiteBuilderSettingsApi(request)}
