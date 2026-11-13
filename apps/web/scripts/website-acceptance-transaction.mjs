// Acceptance-only transaction preparation for the existing hash-verified fixture plan.
// No SQL execution, hosted target selection, credentials or production ledger mutation.
// Limited lexical envelope reader, NOT a general SQL parser or SQL safety validator.
// Strings assume standard_conforming_strings=on, enforced inside the prepared transaction.
import {createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
const refuse=reason=>{throw Error('ACCEPTANCE_SQL_'+reason);};

function statements(sql){
 if(typeof sql!=='string'||sql.includes('\0'))refuse('INVALID_INPUT');
 const result=[];let start=null,code='',i=0;
 const flush=end=>{
  if(code.trim())result.push({start,end,code:code.trim().replace(/\s+/g,' ')});
  start=null;code='';
 };
 while(i<sql.length){
  if(sql.startsWith('--',i)){const end=sql.indexOf('\n',i+2);i=end<0?sql.length:end;code+=' ';continue;}
  if(sql.startsWith('/*',i)){
   let depth=1;i+=2;
   while(i<sql.length&&depth){
    if(sql.startsWith('/*',i)){depth++;i+=2;}
    else if(sql.startsWith('*/',i)){depth--;i+=2;}
    else i++;
   }
   if(depth)refuse('UNTERMINATED_COMMENT');code+=' ';continue;
  }
  const c=sql[i];
  if(/\s/.test(c)){code+=' ';i++;continue;}
  if(c===';'){flush(i+1);i++;continue;}
  if(start===null)start=i;
  if(c==='\\')refuse('PSQL_COMMAND');
  if(c==="'"||c==='"'){
   if(/[uU]&$/.test(sql.slice(Math.max(0,i-2),i)))refuse('UNICODE_QUOTE_UNSUPPORTED');
   const escaped=c==="'"&&/[eE]/.test(sql[i-1]??'')&&!/[a-zA-Z0-9_$]/.test(sql[i-2]??'');
   const quote=c;i++;let closed=false;
   while(i<sql.length){
    if(escaped&&sql[i]==='\\'){i+=2;continue;}
    if(sql[i]===quote){
     if(sql[i+1]===quote){i+=2;continue;}
     i++;closed=true;break;
    }i++;
   }
   if(!closed)refuse('UNTERMINATED_QUOTE');code+=' ? ';continue;
  }
  if(c==='$'&&!/[a-zA-Z0-9_$]/.test(sql[i-1]??'')){
   const tag=/^\$(?:[a-zA-Z_][a-zA-Z0-9_]*)?\$/.exec(sql.slice(i))?.[0];
   if(tag){
    const end=sql.indexOf(tag,i+tag.length);if(end<0)refuse('UNTERMINATED_DOLLAR_QUOTE');
    i=end+tag.length;code+=' ? ';continue;
   }
  }
  code+=c;i++;
 }
 flush(sql.length);
 return result;
}

export function stripOuterTransaction(sql){
 const parts=statements(sql);
 const controls=parts.filter(p=>/^(BEGIN|START|COMMIT|END|ROLLBACK|ABORT|SAVEPOINT|RELEASE)\b|^PREPARE\s+TRANSACTION\b|^SET\s+((SESSION|LOCAL)\s+)?TRANSACTION\b/i.test(p.code));
 // These forms need a full PostgreSQL parser/protocol and are outside this reviewed plan.
 if(parts.some(p=>/^COPY\b|^CREATE\b.*\bBEGIN\s+ATOMIC\b|^SET\s+((SESSION|LOCAL)\s+)?standard_conforming_strings\b|^RESET\s+(ALL|standard_conforming_strings)\b/i.test(p.code)))refuse('UNSUPPORTED_STATEMENT');
 if(!controls.length)return {body:sql,removedWrapper:false};
 if(controls.length!==2||controls[0]!==parts[0]||controls[1]!==parts.at(-1)||
    !/^BEGIN$/i.test(controls[0].code)||!/^COMMIT$/i.test(controls[1].code))refuse('TRANSACTION_ENVELOPE');
 let body=sql;
 for(const p of [...controls].reverse())body=body.slice(0,p.start)+body.slice(p.end);
 return {body,removedWrapper:true};
}

const prefix=[
 'BEGIN;',
 'SET LOCAL standard_conforming_strings = on;',
 'CREATE TEMP TABLE omnira_acceptance_tx_guard (id bigint NOT NULL) ON COMMIT DROP;',
 'INSERT INTO pg_temp.omnira_acceptance_tx_guard VALUES (txid_current());',
].join('\n');
const suffix=[
 ';',
 'DO $omnira_acceptance_guard$',
 'BEGIN',
 " IF (SELECT count(*) FROM pg_temp.omnira_acceptance_tx_guard) <> 1 OR",
 "    (SELECT id FROM pg_temp.omnira_acceptance_tx_guard) <> txid_current() THEN",
 "  RAISE EXCEPTION 'ACCEPTANCE_TRANSACTION_CHANGED';",
 ' END IF;',
 ' PERFORM cron.alter_job(jobid, active := false) FROM cron.job WHERE active;',
 ' IF EXISTS (SELECT 1 FROM cron.job WHERE active) THEN',
 "  RAISE EXCEPTION 'ACCEPTANCE_SCHEDULE_STILL_ACTIVE';",
 ' END IF;',
 'END;',
 '$omnira_acceptance_guard$;',
 'COMMIT;',
].join('\n');

export function prepareAcceptanceStep(step){
 if(typeof step?.body!=='string'||hash(step.body)!==step.lfSha256)throw Error('ACCEPTANCE_SOURCE_HASH_MISMATCH');
 const stripped=stripOuterTransaction(step.body);
 const body=prefix+'\n'+stripped.body+'\n'+suffix+'\n';
 return {
  path:step.path,sourceLfSha256:step.lfSha256,
  removedWrapper:stripped.removedWrapper,preparedLfSha256:hash(body),body,
 };
}
