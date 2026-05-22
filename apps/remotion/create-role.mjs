/**
 * Creates the remotion-lambda-role in AWS IAM using the SDK
 * that's already bundled with @remotion/lambda-client.
 * Run: node create-role.mjs
 */
import { IAMClient, CreateRoleCommand, AttachRolePolicyCommand, PutRolePolicyCommand, GetRoleCommand } from '@aws-sdk/client-iam'

const client = new IAMClient({ region: 'us-east-1' }) // IAM is always us-east-1
const ROLE_NAME = 'remotion-lambda-role'

const trustPolicy = JSON.stringify({
  Version: '2012-10-17',
  Statement: [{
    Effect: 'Allow',
    Principal: { Service: 'lambda.amazonaws.com' },
    Action: 'sts:AssumeRole',
  }],
})

const remotionPolicy = JSON.stringify({
  Version: '2012-10-17',
  Statement: [
    {
      Effect: 'Allow',
      Action: ['s3:GetObject','s3:DeleteObject','s3:PutObject','s3:CreateMultipartUpload',
               's3:ListParts','s3:AbortMultipartUpload','s3:UploadPart','s3:CompleteMultipartUpload','s3:ListBucket'],
      Resource: ['arn:aws:s3:::remotionlambda-*/*','arn:aws:s3:::remotionlambda-*'],
    },
    {
      Effect: 'Allow',
      Action: ['lambda:InvokeFunction'],
      Resource: ['arn:aws:lambda:*:*:function:remotion-render-*'],
    },
    {
      Effect: 'Allow',
      Action: ['logs:CreateLogGroup','logs:CreateLogStream','logs:PutLogEvents'],
      Resource: ['arn:aws:logs:*:*:*'],
    },
  ],
})

async function run() {
  // Check if role already exists
  try {
    await client.send(new GetRoleCommand({ RoleName: ROLE_NAME }))
    console.log('✅ Role already exists — skipping creation')
  } catch {
    console.log('Creating IAM role...')
    await client.send(new CreateRoleCommand({
      RoleName: ROLE_NAME,
      AssumeRolePolicyDocument: trustPolicy,
      Description: 'Role for Remotion Lambda rendering',
    }))
    console.log('✅ Role created')
  }

  console.log('Attaching AWSLambdaBasicExecutionRole...')
  await client.send(new AttachRolePolicyCommand({
    RoleName: ROLE_NAME,
    PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
  }))

  console.log('Adding Remotion inline policy...')
  await client.send(new PutRolePolicyCommand({
    RoleName: ROLE_NAME,
    PolicyName: 'remotion-lambda-policy',
    PolicyDocument: remotionPolicy,
  }))

  console.log('✅ All done! Waiting 10s for IAM to propagate...')
  await new Promise(r => setTimeout(r, 10000))
  console.log('Now run: npx remotion lambda functions deploy')
}

run().catch(e => { console.error('❌', e.message); process.exit(1) })
