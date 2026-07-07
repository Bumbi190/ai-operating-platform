/**
 * lib/bugs/registry.ts
 *
 * Scanner-registret — "allt om mina projekt samlat i Omnira".
 *
 * Läser aktiva rader ur project_scanners. Om tabellen är tom eller saknas
 * (innan migration/seed) faller den tillbaka på en hårdkodad default-lista så
 * orchestratorn fungerar direkt. Secreten lagras ALDRIG i DB — bara namnet på
 * env-variabeln; värdet slås upp i process.env vid körning.
 */

export interface ScannerTarget {
  projectId: string | null
  label: string
  scannerUrl: string
  secretEnvKey: string | null
  expectedCheckCount: number | null
}

/**
 * Default-registret. Alla tre sajterna delar i nuläget samma BUGSCANNER_SECRET
 * (samma värde validerar varje sajts egna endpoint). Per-projekt-override görs
 * genom att lägga in rader i project_scanners med eget secret_env_key.
 */
export function defaultScanners(): ScannerTarget[] {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ai-operating-platform-web.vercel.app'
  return [
    { projectId: null, label: 'AI Operating Platform', scannerUrl: `${appUrl}/api/bugscanner/run`, secretEnvKey: 'BUGSCANNER_SECRET', expectedCheckCount: null },
    { projectId: null, label: 'Gainpilot',             scannerUrl: 'https://gainpilot.se/api/bugscanner/run',       secretEnvKey: 'BUGSCANNER_SECRET', expectedCheckCount: null },
    { projectId: null, label: 'Familje-Stunden',       scannerUrl: 'https://familje-stunden.se/api/bugscanner/run', secretEnvKey: 'BUGSCANNER_SECRET', expectedCheckCount: null },
  ]
}

/**
 * Hämtar aktiva scanners. db = service-role admin-klient (any-typad i detta repo).
 * Faller tillbaka på defaultScanners() om tabellen är tom/saknas.
 */
export async function getScanners(db: any): Promise<ScannerTarget[]> {
  try {
    const { data, error } = await db
      .from('project_scanners')
      .select('project_id, label, scanner_url, secret_env_key, expected_check_count, enabled')
      .eq('enabled', true)

    if (error || !data || data.length === 0) return defaultScanners()

    return data.map((r: any) => ({
      projectId: r.project_id ?? null,
      label: r.label,
      scannerUrl: r.scanner_url,
      secretEnvKey: r.secret_env_key ?? null,
      expectedCheckCount: r.expected_check_count ?? null,
    }))
  } catch {
    return defaultScanners()
  }
}
