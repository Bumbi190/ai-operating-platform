/**
 * Checks current Lambda concurrency quota and requests an increase to 100.
 * Run: node request-quota.mjs
 */
import {
  ServiceQuotasClient,
  GetAWSDefaultServiceQuotaCommand,
  GetServiceQuotaCommand,
  RequestServiceQuotaIncreaseCommand,
} from '@aws-sdk/client-service-quotas'

import { LambdaClient, GetAccountSettingsCommand } from '@aws-sdk/client-lambda'

const creds = {
  accessKeyId:     'REDACTED_AWS_KEY_ID',
  secretAccessKey: 'REDACTED_AWS_SECRET',
}

const sqClient = new ServiceQuotasClient({ region: 'eu-north-1', credentials: creds })
const lambdaClient = new LambdaClient({ region: 'eu-north-1', credentials: creds })

// Lambda service code: L
// Quota name: Concurrent executions
// Quota code: L-B99A9384

async function run() {
  // 1. Check actual current limit
  const accountSettings = await lambdaClient.send(new GetAccountSettingsCommand({}))
  console.log('Current Lambda account concurrency limit:', accountSettings.AccountLimit?.ConcurrentExecutions)
  console.log('Unreserved concurrency:', accountSettings.AccountLimit?.UnreservedConcurrentExecutions)

  // 2. Check applied quota
  try {
    const applied = await sqClient.send(new GetServiceQuotaCommand({
      ServiceCode: 'lambda',
      QuotaCode:   'L-B99A9384',
    }))
    console.log('Applied quota (concurrent executions):', applied.Quota?.Value)
  } catch (e) {
    console.log('Applied quota not found, using default')
  }

  // 3. Check default quota
  const def = await sqClient.send(new GetAWSDefaultServiceQuotaCommand({
    ServiceCode: 'lambda',
    QuotaCode:   'L-B99A9384',
  }))
  console.log('Default quota:', def.Quota?.Value)

  // 4. Request increase to 100
  console.log('\nRequesting increase to 100 concurrent executions...')
  try {
    const req = await sqClient.send(new RequestServiceQuotaIncreaseCommand({
      ServiceCode:  'lambda',
      QuotaCode:    'L-B99A9384',
      DesiredValue: 100,
    }))
    console.log('✅ Request submitted:', req.RequestedQuota?.Status, '—', req.RequestedQuota?.Id)
    console.log('Note: quota increases usually take a few minutes to hours to apply.')
  } catch (e) {
    if (e.message.includes('already been requested')) {
      console.log('ℹ️  Quota increase already requested — it may still be pending.')
    } else {
      console.log('❌ Request failed:', e.message)
    }
  }
}

run().catch(e => { console.error('❌', e.message); process.exit(1) })
