/**
 * Sets CORS policy on the Remotion S3 bucket so browsers can fetch
 * video files cross-origin (needed for blob download).
 * Run: node set-s3-cors.mjs
 */
import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3'

const client = new S3Client({
  region: 'eu-north-1',
  credentials: {
    accessKeyId:     'REDACTED_AWS_KEY_ID',
    secretAccessKey: 'REDACTED_AWS_SECRET',
  },
})

await client.send(new PutBucketCorsCommand({
  Bucket: 'remotionlambda-eunorth1-401x2imzry',
  CORSConfiguration: {
    CORSRules: [{
      AllowedOrigins: ['https://ai-operating-platform-web.vercel.app', 'http://localhost:3000'],
      AllowedMethods: ['GET', 'HEAD'],
      AllowedHeaders: ['*'],
      MaxAgeSeconds: 3600,
    }],
  },
}))

console.log('✅ CORS configured on S3 bucket')
