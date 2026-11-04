export const COMPANY_WEBSITE_CONFIRMATION='UNDERSÖK WEBBPLATS' as const
export type CompanyWebsiteEvidence={orgnr:string;workplaceRef:string|null;legalName:string;state:'identity_match'|'no_match';websiteUrl:string|null;sourceUrl:string|null;excerpt:string|null;checkedAt:string;providerCalls:number;outreachReady:false}
export type CompanyWebsiteResponse=CompanyWebsiteEvidence&{projectId:string}
