import {redirect} from 'next/navigation'
import {loadWebsiteBuilderSettings} from '@/lib/website-build/planning/settings'
import {ProjectWebsiteBuilderSettings} from '@/components/platform/vnext/ProjectWebsiteBuilderSettings'
export const dynamic='force-dynamic'
export default async function WebsiteBuildSettingsPage(){
 const model=await loadWebsiteBuilderSettings()
 if(!model)redirect('/login')
 return <div className="p-4 md:p-6"><a href="/settings">← Inställningar</a><ProjectWebsiteBuilderSettings model={model}/></div>
}
