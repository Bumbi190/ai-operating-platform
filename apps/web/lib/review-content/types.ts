export type ReviewMedia={id:string;kind:'image'|'video';src:string;alt:string};
export type OwnedPreviewRef={assetId:string;sha256:string;name:string;mimeType:string|null};
export type ReviewAttachment={id:string;name:string;mimeType:string|null;preview:ReviewMedia|null};
export type ReviewContent={kind:'text';text:string}|{kind:'media';text:string;media:ReviewMedia[];notice?:string}|{kind:'email';to:string[];cc:string[];bcc:string[];subject:string;bodyText:string;attachments:ReviewAttachment[]}|{kind:'unavailable';reason:string};
