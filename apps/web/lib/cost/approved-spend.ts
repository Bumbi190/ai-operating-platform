/** Human consent is an additional ceiling, never a budget override. */
export function assertApprovedStorySpend(currentCeiling:number,approvedMaximum:number):void{
 if(!approvedSpendWithin(currentCeiling,approvedMaximum))
  throw new Error('The current hard spend ceiling exceeds or cannot prove the human-approved maximum')
}
export function approvedSpendWithin(currentCeiling:number,approvedMaximum:number):boolean{
 return Number.isFinite(currentCeiling)&&currentCeiling>0&&Number.isFinite(approvedMaximum)&&approvedMaximum>0&&currentCeiling<=approvedMaximum
}
