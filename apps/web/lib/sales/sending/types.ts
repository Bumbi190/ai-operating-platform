export type ConfirmSendInput={projectId:string;revisionId:string;expectedRevisionHash:string;expectedMailboxGeneration:number;idempotencyKey:string}
export type SendRef={projectId:string;sendJobId:string;workerId:string;claimId:string;generation:number}
export type SendStatus='queued'|'claimed'|'dispatching'|'smtp_accepted'|'failed_before_send'|'delivery_unknown'|'cancelled'
export type SendJobSummary={id:string;status:SendStatus;revisionId:string;revisionHash:string;createdAt:string;acceptedAt:string|null;detail:string|null;serverAccepted:boolean;deliveryConfirmed:false}
export type SendSnapshot={sealedJson:string;snapshotSha256:string}
export type SendReadInput={projectId:string;sendJobId:string}
export type SendCancelInput=SendReadInput&{expectedRevisionHash:string}
