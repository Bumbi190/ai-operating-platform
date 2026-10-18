// Read-only operator diagnostic. Supply the actual operator ID; SQL revalidates project membership.
import {createAdminClient} from '../lib/supabase/admin'
import {readScheduleReadiness} from '../lib/social-launch/scheduling/readiness'
const args=Object.fromEntries(process.argv.slice(2).map(v=>v.replace(/^--/,'').split('=')))
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
async function main(){
 if(!uuid.test(args.project??'')||!uuid.test(args.user??''))throw Error('Use --project=<UUID> --user=<actual operator UUID>')
 console.log(JSON.stringify(await readScheduleReadiness(createAdminClient(),{userId:args.user,allowedProjectIds:[args.project]},{projectId:args.project}),null,2))
}
main().catch(()=>{console.error('Readiness unavailable; no publication attempted.');process.exitCode=1})
