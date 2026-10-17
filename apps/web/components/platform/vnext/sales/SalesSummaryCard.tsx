import Link from 'next/link'
import {salesEnabled} from '@/lib/sales/feature'
export function SalesSummaryCard({projectId,slug}:{projectId:string;slug:string|null}){
 if(!slug||!salesEnabled(projectId))return null
 return <aside aria-label="Säljförberedelse" style={{padding:'1rem 1.25rem',border:'1px solid var(--border, #334155)',borderRadius:16,margin:'1rem 0'}}><strong>Säljförberedelse med Atlas</strong><p>Kontakter, personliga mejlutkast och granskning. Utskick är inte aktiverat.</p><Link href={`/projects/${encodeURIComponent(slug)}/sales`}>Öppna säljunderlag →</Link></aside>
}
