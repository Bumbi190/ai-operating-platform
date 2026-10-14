// Test transport only: no paid SDK call can occur through the deterministic provider.
export * from '../lib/cost/governed-spend'
export async function withGovernedSpend(_input:unknown,run:()=>Promise<unknown>){return run()}
