export type Provider='linkedin'|'pinterest'|'x'
export type Candidate={key:string;accountId:string;accountLabel:string;destinationId:string|null;destinationLabel:string|null}
export type Grant={accessToken:string;refreshToken:string|null;scopes:string[];expiresAt:string;refreshExpiresAt:string|null;candidates:Candidate[]}
export type OAuthConfig={clientId:string;clientSecret:string}
export type ConnectionView={intentId:string;projectId:string;provider:Provider;status:'awaiting_selection'|'connected';candidates:Candidate[];bindingId:string|null;selectedKey:string|null;expiresAt:string}
export type ConnectionSetup={provider:Provider;configured:boolean;reason:'ready'|'app_configuration_missing'|'cost_policy_required';consoleUrl:string;callbackUrl:string}
export class ConnectionError extends Error{
 constructor(public code:'INVALID_BODY'|'NOT_FOUND'|'CONFLICT'|'PLAN_REVIEW_REQUIRED'|'BINDING_CHANGED'|'EXPIRED'|'ACCOUNT_IN_USE'|'UNAVAILABLE'|'CONFIGURATION_REQUIRED'|'COST_POLICY_REQUIRED'|'PROVIDER_DENIED'|'SCOPE_MISSING'|'IDENTITY_UNVERIFIED'|'INVENTORY_LIMIT'){super(code);this.name='ConnectionError'}
 get status(){return this.code==='NOT_FOUND'?404:this.code==='INVALID_BODY'?400:['PLAN_REVIEW_REQUIRED','CONFLICT','BINDING_CHANGED','EXPIRED','ACCOUNT_IN_USE'].includes(this.code)?409:this.code==='COST_POLICY_REQUIRED'?403:503}
}

export type SocialConnectionCard={provider:Provider;bindingId:string|null;destinationId:string|null;destinationLabel:string|null;canOperate:boolean;setup:ConnectionSetup;account:import('../social-launch/types').SocialLaunchAccount}
