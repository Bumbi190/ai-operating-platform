export interface HostPrincipal {ownerId:string;projectId:string;workerId:string;generation:number}
export interface HostStatus {
 workerId:string;managed:boolean;generation:number;desiredState:'running'|'paused';connectionState:'online'|'offline'|'revoked';
 cliState:'ready'|'blocked'|'unknown';lastSeenAt:string|null;workerExpiresAt:string;executionPaused:boolean;reconnectRequested:boolean
}
export interface RotationReceipt {generation:number;expiresAt:string}
