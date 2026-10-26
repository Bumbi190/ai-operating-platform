import {expect,it} from 'vitest';
import {deriveStoredReviewContent} from './review-queue-adapter';
const projectId='10000000-0000-4000-8000-000000000001',assetId='30000000-0000-4000-8000-000000000001';
it('preserves normal stored text and attaches only safe same-origin hash-bound previews to explicit email attachments',()=>{
 expect(deriveStoredReviewContent({kind:'workflow_output',outputKey:'report',content:'Full report'})).toEqual({kind:'text',text:'Full report'});
 const content=JSON.stringify({to:['a@example.se'],subject:'Hej',bodyText:'Full body',attachments:[{assetId,sha256:'a'.repeat(64),name:'Bild',mimeType:'image/jpeg'}]});
 const result=deriveStoredReviewContent({kind:'email_draft',outputKey:null,content,projectId});expect(result.kind).toBe('email');if(result.kind==='email')expect(result.attachments[0].preview?.src).toBe('/api/social-content/media?projectId='+projectId+'&assetId='+assetId+'&sha256='+'a'.repeat(64));
 const missing=deriveStoredReviewContent({kind:'email_draft',outputKey:null,content});if(missing.kind==='email')expect(missing.attachments[0].preview).toBe(null);
});
