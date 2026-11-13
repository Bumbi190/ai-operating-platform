export interface MailboxContext {projectId:string;workerId:string;mailboxId:string;setupId:string;kid:string;email:string;expiresAt:string}
export interface SealedMailboxEnvelope {format:'sales-strato-envelope-v1';wrappedKey:string;iv:string;ciphertext:string}
export interface MailboxStatus {mailboxId:string;email:string;status:'not_connected'|'waiting_for_host'|'probing'|'authenticated'|'needs_input'|'reconciling';smtpAuthenticatedAt:string|null;imapAuthenticatedAt:string|null;reasonCode:string|null;inboxEnabled:boolean;sendingEnabled:false}
