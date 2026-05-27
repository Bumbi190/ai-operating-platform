/**
 * Fixes the remotion-lambda-role inline policy to add the missing
 * s3:ListAllMyBuckets permission (requires Resource: "*").
 *
 * Run: node fix-role-policy.mjs
 */
import { IAMClient, PutRolePolicyCommand } from '@aws-sdk/client-iam'

const client = new IAMClient({
  region: 'us-east-1', // IAM is always us-east-1
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID     ?? 'REDACTED_AWS_KEY_ID',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'REDACTED_AWS_SECRET',
  },
})

const ROLE_NAME   = 'remotion-lambda-role'
const POLICY_NAME = 'remotion-lambda-policy'

// Full corrected policy — adds s3:ListAllMyBuckets with Resource: "*"
const policy = {
  Version: '2012-10-17',
  Statement: [
    {
      // Bucket-level and object-level S3 ops on Remotion buckets
      Effect: 'Allow',
      Action: [
        's3:GetObject',
        's3:DeleteObject',
        's3:PutObject',
        's3:CreateMultipartUpload',
        's3:ListParts',
        's3:AbortMultipartUpload',
        's3:UploadPart',
        's3:CompleteMultipartUpload',
        's3:ListBucket',
        's3:PutObjectAcl',
      ],
      Resource: [
        'arn:aws:s3:::remotionlambda-*/*',
        'arn:aws:s3:::remotionlambda-*',
      ],
    },
    {
      // ListAllMyBuckets requires Resource: "*" — it's account-scoped, not bucket-scoped
      Effect: 'Allow',
      Action: ['s3:ListAllMyBuckets'],
      Resource: ['*'],
    },
    {
      // Lambda self-invocation for frame sharding
      Effect: 'Allow',
      Action: ['lambda:InvokeFunction'],
      Resource: ['arn:aws:lambda:*:*:function:remotion-render-*'],
    },
    {
      // CloudWatch Logs
      Effect: 'Allow',
      Action: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ],
      Resource: ['arn:aws:logs:*:*:*'],
    },
  ],
}

console.log('Updating remotion-lambda-role inline policy...')

await client.send(new PutRolePolicyCommand({
  RoleName:       ROLE_NAME,
  PolicyName:     POLICY_NAME,
  PolicyDocument: JSON.stringify(policy),
}))

console.log('✅ Policy updated! Waiting 5s for IAM to propagate...')
await new Promise(r => setTimeout(r, 5000))
console.log('✅ Done. Re-run: node test-render.mjs')
