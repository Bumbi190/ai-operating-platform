import {decodePackageView,decodeReceiptView,exactKeys,isObject,isUuid,type PackageView,type ReceiptView} from './contracts'
export type CleanupReviewView={packageView:PackageView;reviewRef:string;decisionState:'pending'|'approved'|'rejected';executionId:string|null;receipt:ReceiptView|null;rejectionStatus?:'needs_new_review'|'denied'|'disabled'}
export function decodeReviewView(v:unknown):CleanupReviewView|null{
 if(!isObject(v)||!exactKeys(v,['packageView','reviewRef','decisionState','executionId','receipt',...(v.rejectionStatus===undefined?[]:['rejectionStatus'])])||!isUuid(v.reviewRef)||!['pending','approved','rejected'].includes(String(v.decisionState))||(v.executionId!==null&&!isUuid(v.executionId)))return null
 if(v.rejectionStatus!==undefined&&(!['needs_new_review','denied','disabled'].includes(String(v.rejectionStatus))||v.decisionState!=='approved'||v.receipt!==null||!isUuid(v.executionId)))return null
 const pkg=decodePackageView(v.packageView);if(!pkg||pkg.status!=='prepared')return null
 const receipt=v.receipt===null?null:decodeReceiptView(v.receipt)
 if(v.receipt!==null&&(!receipt||receipt.packageId!==pkg.packageId||receipt.executionId!==v.executionId||receipt.operation!==pkg.operation))return null
 if(v.decisionState!=='approved'&&(v.executionId!==null||receipt!==null))return null
 return {packageView:pkg,reviewRef:v.reviewRef,decisionState:v.decisionState as CleanupReviewView['decisionState'],executionId:v.executionId as string|null,receipt,...(v.rejectionStatus===undefined?{}:{rejectionStatus:v.rejectionStatus as CleanupReviewView['rejectionStatus']})}
}
export function decodeCleanupEffect(v:unknown,conversationId:string|null):CleanupReviewView|null{
 if(!isObject(v)||!exactKeys(v,['event','conversationId','review'])||v.event!=='handlarborsen_test_data_review'||v.conversationId!==conversationId)return null
 const view=decodeReviewView(v.review);return view?.packageView.conversationId===conversationId?view:null
}
export function cleanupOutcome(view:CleanupReviewView):string{
 if(view.rejectionStatus==='needs_new_review')return 'Ny granskning behövs'
 if(view.rejectionStatus==='denied')return 'Behörighet saknas — granska åtkomsten och förbered ett nytt paket'
 if(view.rejectionStatus==='disabled')return 'Körning är avstängd — förbered ett nytt paket när den har aktiverats'
 if(view.receipt?.outcome==='applied')return view.packageView.operation==='restore'?'Testdata återställd':'Testdata undanlagd'
 if(view.receipt?.outcome==='needs_new_review')return 'Ny granskning behövs'
 if(view.decisionState==='rejected')return 'Avböjt'
 if(view.decisionState==='approved')return 'Utfallet kontrolleras'
 if(Date.parse(view.packageView.expiresAt)<=Date.now())return 'Ny granskning behövs'
 return 'Inväntar ditt godkännande'
}
