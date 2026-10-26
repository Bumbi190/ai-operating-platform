import {expect,it} from 'vitest';
import {normalizeReviewContent} from './normalize';
it('preserves complete safe text and explicit email headers/body without fetching links',()=>{
 expect(normalizeReviewContent({kind:'workflow_output',outputKey:'report',content:'Hello <script>untrusted</script>'})).toEqual({kind:'text',text:'Hello <script>untrusted</script>'});
 const email={to:['a@example.se'],cc:['b@example.se'],bcc:['c@example.se'],subject:'Hej',bodyText:'Hela\nmejlet',attachments:[]};
 expect(normalizeReviewContent({kind:'email_draft',outputKey:null,content:JSON.stringify(email)})).toEqual({kind:'email',...email});
});
it('does not infer recipients, render unknown HTML, or silently clip oversized content',()=>{
 const raw='{"subject":"Hej","html":"<img src=https://tracker.example>"}';expect(normalizeReviewContent({kind:'draft_email',outputKey:null,content:raw})).toEqual({kind:'text',text:raw});
 expect(normalizeReviewContent({kind:'email_draft',outputKey:null,content:JSON.stringify({to:['injected\r\nBcc:x'],subject:'x',bodyText:'y'})}).kind).toBe('text');
 expect(normalizeReviewContent({kind:null,outputKey:null,content:'x'.repeat(131073)}).kind).toBe('unavailable');
});
it('recognizes only explicit attachment asset identities and never treats arbitrary links as owned media',()=>{
 const raw=JSON.stringify({to:['a@example.se'],subject:'Hej',bodyText:'https://example.se/image.png',attachments:[{url:'https://evil.example/a.png'}]});expect(normalizeReviewContent({kind:'email_draft',outputKey:null,content:raw}).kind).toBe('text');
});
