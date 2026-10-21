import {createAdminClient} from './website-build-fixture-db'
import {TEST_PRINCIPAL} from '../lib/website-build/test-db'
export async function createClient(){return {auth:{getUser:async()=>({data:{user:{id:TEST_PRINCIPAL.userId,email:'fixture@example.test'}}})},from:createAdminClient().from}}
