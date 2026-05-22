import { deployFunction } from '@remotion/lambda/client';
const r = await deployFunction({
  region: 'eu-central-1',
  timeoutInSeconds: 240,
  memorySizeInMb: 3009,
  createCloudWatchLogGroup: true,
  overwriteIfExists: true,
});
console.log('functionName:', r.functionName);
