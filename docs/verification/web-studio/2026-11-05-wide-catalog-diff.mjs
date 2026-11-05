import {readFileSync,writeFileSync} from 'node:fs';
const root='C:/Users/Andre/Projects/Omnira/Temp/';
const p=JSON.parse(readFileSync(root+'webbuilder-production-wide-catalog-20261105.json','utf8'));
const run=JSON.parse(readFileSync(root+'webbuilder-local-wide-catalog-20261105.json','utf8'));
if(!run.receipt.completed||run.receipt.cleanup!=='removed'||!run.catalog)throw Error('Incomplete local catalog evidence');
const l=run.catalog;
if(p.search_path!=='pg_catalog'||l.search_path!=='pg_catalog')throw Error('Unaligned catalog search path');
const key=o=>o.kind+':'+o.key;
const canonical=v=>JSON.stringify(v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const pm=new Map(p.objects.map(o=>[key(o),o])),lm=new Map(l.objects.map(o=>[key(o),o]));
if(pm.size!==p.objects.length||lm.size!==l.objects.length)throw Error('Duplicate object identity');
const missing=[...pm.keys()].filter(k=>!lm.has(k)),extra=[...lm.keys()].filter(k=>!pm.has(k)),changed=[];
for(const [k,v] of pm)if(lm.has(k)){
 const fields=[...new Set([...Object.keys(v.definition),...Object.keys(lm.get(k).definition)])].sort();
 const differences=fields.filter(f=>canonical(v.definition[f])!==canonical(lm.get(k).definition[f])).map(field=>({field,production:v.definition[field],local:lm.get(k).definition[field]}));
 if(differences.length)changed.push({kind:v.kind,key:v.key,differences});
}
const result={productionObjects:pm.size,localObjects:lm.size,missing,extra,changed,counts:{missing:missing.length,extra:extra.length,changed:changed.length,unchanged:[...pm.keys()].filter(k=>lm.has(k)).length-changed.length}};
writeFileSync(root+'webbuilder-wide-catalog-diff-20261105.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({counts:result.counts,missing,extra,changedByKind:changed.reduce((m,c)=>(m[c.kind]=(m[c.kind]||0)+1,m),{}),substantiveChanges:changed.filter(c=>c.differences.some(d=>!['acl','owner'].includes(d.field))).map(c=>({kind:c.kind,key:c.key,differences:c.differences})),aclOnlyCount:changed.filter(c=>c.differences.every(d=>['acl','owner'].includes(d.field))).length},null,2));
