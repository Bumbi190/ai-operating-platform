import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root='C:/Users/Andre/Projects/Omnira/';
const repo=root+'.worktrees/atlas-builder-references-20261017/';
const defs=JSON.parse(readFileSync(root+'Temp/webbuilder-production-guard-functions-20261105.json','utf8'));
const paths={runs_action_binding_guard:'20260830_workflow_action_binding.sql',runs_action_outcome_guard:'20260830_action_failure_model.sql',runs_human_story_binding_guard:'20261024172905_human_story_start.sql',runs_require_bind_provenance:'20261024172905_human_story_start.sql'};
const lf=s=>s.replace(/\r\n/g,'\n');
const hash=s=>createHash('md5').update(s).digest('hex');

const localCatalog=JSON.parse(readFileSync(root+'Temp/webbuilder-local-wide-catalog-20261105.json','utf8')).catalog;
function tokens(sql){
 const out=[];
 for(let i=0;i<sql.length;){
  if(/\s/.test(sql[i])){i++;continue;}
  if(sql.startsWith('--',i)){const end=sql.indexOf('\n',i);i=end<0?sql.length:end;continue;}
  if(sql.startsWith('/*',i)){let depth=1;i+=2;while(depth&&i<sql.length){if(sql.startsWith('/*',i)){depth++;i+=2;}else if(sql.startsWith('*/',i)){depth--;i+=2;}else i++;}if(depth)throw Error('Unclosed comment');continue;}
  const quote=sql[i];
  if(quote==="'"||quote==='"'){let j=i+1,closed=false;while(j<sql.length){if(sql[j]===quote){if(sql[j+1]===quote){j+=2;continue;}j++;closed=true;break;}j++;}if(!closed)throw Error('Unclosed literal');out.push(sql.slice(i,j));i=j;continue;}
  const word=sql.slice(i).match(/^[a-zA-Z_0-9$]+/);
  if(word){out.push(word[0]);i+=word[0].length;continue;}
  const operator=sql.slice(i).match(/^(->>|::|:=|<>|!=|<=|>=|\|\||->)/);
  if(operator){out.push(operator[0]);i+=operator[0].length;continue;}
  out.push(sql[i++]);
 }
 return out;
}
const results=[];
for(const d of defs){
 const source=lf(readFileSync(repo+'apps/web/supabase/migrations/'+paths[d.proname],'utf8'));
 const start=source.toLowerCase().indexOf('function public.'+d.proname+'(');
 const tail=source.slice(start);
 const tag=tail.match(/\bas\s+(\$[a-zA-Z_0-9]*\$)/i);
 if(!tag)throw Error('Missing body tag');
 const bodyStart=tag.index+tag[0].length,bodyEnd=tail.indexOf(tag[1],bodyStart);
 const local=tail.slice(bodyStart,bodyEnd);
 const prod=d.definition.match(/AS \$function\$([\s\S]*)\$function\$/)?.[1];
 if(prod===undefined)throw Error('Missing production body');
 const a=lf(prod),b=lf(local);
 let first=0;while(first<Math.min(a.length,b.length)&&a[first]===b[first])first++;
 const expected=localCatalog.objects.find(o=>o.kind==='function'&&o.key===d.proname+'()').definition.definition_md5;
 const reconstructed=d.definition.replace(/(AS \$function\$)[\s\S]*(\$function\$)/,(_,head,tail)=>head+local+tail);
 const tokenEqual=JSON.stringify(tokens(a))===JSON.stringify(tokens(b));
 results.push({name:d.proname,reconstructedMatchesLocalHash:hash(reconstructed)===expected,tokenEqual,lfBodyEqual:a===b,rawBodyEqual:prod===local});
 console.log(JSON.stringify({name:d.proname,rawBodyEqual:prod===local,lfBodyEqual:a===b,productionBytes:Buffer.byteLength(prod),localBytes:Buffer.byteLength(local),productionDefinitionMD5:hash(d.definition),firstDiff:first,snippetProd:a.slice(Math.max(0,first-80),first+120),snippetLocal:b.slice(Math.max(0,first-80),first+120)}));
}

writeFileSync(root+'Temp/webbuilder-guard-source-comparison-20261105.json',JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));
