// Test transport only: no paid SDK call can occur through the deterministic provider.
export * from '../lib/cost/governed-spend'
const fixtureBilling:unknown[]=[]
export function readFixtureBilling(){return fixtureBilling}
export async function withGovernedSpend(input:unknown,run:()=>Promise<unknown>){fixtureBilling.push(input);return run()}
