import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {ReviewContentPreview} from '../../components/review-content/ReviewContentPreview';
Object.assign(globalThis,{React});
it('renders inspectable owned image and explicit-play video directly, without autoplay or markup execution',()=>{
 const html=renderToStaticMarkup(<ReviewContentPreview content={{kind:'media',text:'<script>unsafe</script>',media:[{id:'i',kind:'image',src:'/api/social-content/media?x',alt:'Bild'},{id:'v',kind:'video',src:'https://s3.eu-north-1.amazonaws.com/example.mp4',alt:'Film'}]}}/>);
 expect(html).toContain('<img');expect(html).toContain('<video');expect(html).toContain('controls=""');expect(html).toContain('preload="none"');expect(html).not.toContain('autoPlay');expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;');
});
it('shows the entire email draft with To/Cc/Bcc, subject, body and attachment metadata in the panel',()=>{
 const html=renderToStaticMarkup(<ReviewContentPreview content={{kind:'email',to:['a@example.se'],cc:['b@example.se'],bcc:['c@example.se'],subject:'Ämne',bodyText:'Hela texten\nNästa rad',attachments:[{id:'a',name:'Underlag.pdf',mimeType:'application/pdf',preview:null}]}}/>);
 for(const value of ['a@example.se','b@example.se','c@example.se','Ämne','Hela texten','Nästa rad','Underlag.pdf'])expect(html).toContain(value);expect(html).not.toMatch(/iframe|<form|<button|mailto:/);
});
it('explains unavailable media and preserves plain source text without silently clipping',()=>{
 expect(renderToStaticMarkup(<ReviewContentPreview content={{kind:'unavailable',reason:'Underlag saknas'}}/>)).toContain('Underlag saknas');
 expect(renderToStaticMarkup(<ReviewContentPreview content={{kind:'text',text:'A'.repeat(2000)+'END'}}/>)).toContain('END');
});
