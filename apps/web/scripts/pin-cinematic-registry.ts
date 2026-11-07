import {writeFileSync} from 'node:fs'
import {cinematicPackageManifest,cinematicPackagePages} from '../lib/website-build/studio/cinematic-package'
async function main(){const manifest=await cinematicPackageManifest(),pages=await cinematicPackagePages();writeFileSync('lib/website-build/studio/cinematic-registry.json',JSON.stringify({manifest,pages})+'\n');console.log({sha256:manifest.sha256,pages:pages.length,bytes:Buffer.byteLength(JSON.stringify(pages))})}
void main()
