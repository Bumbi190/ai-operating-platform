import {expect,it} from 'vitest';
import {projectCalendarSocial} from './source-social';
import {weekRange} from './time';
it('keeps edit source current while binding inline preview to the scheduled content revision',()=>{
 const post:any={id:'p',revision:{id:'new',sha256:'b'.repeat(64),draft:{title:'Ny text',scheduledAt:'2026-10-29T10:00:00Z'}},requirements:[]};
 const batch:any={manifest:{items:[{postId:'p',revisionId:'old',sha256:'a'.repeat(64)}]},jobs:[{id:'j',postId:'p',state:'queued',channel:'facebook',scheduledAt:'2026-10-28T10:00:00Z'}],review:[{item:{postId:'p',revisionId:'old'},revision:{id:'old',draft:{title:'Schemalagd text'}}}]};
 const entry=projectCalendarSocial('project',[post],[batch],false,'/source',weekRange('2026-10-26'))[0];
 expect(entry.source).toMatchObject({revisionId:'new'});expect(entry.contentSource).toMatchObject({revisionId:'old',sha256:'a'.repeat(64),jobId:'j'});
});
