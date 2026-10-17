import {fileURLToPath} from 'node:url';import path from 'node:path';
import {runJob} from './worker.mjs';import {candidate} from './candidates.mjs';import {createOllamaClient} from './ollama.mjs';
import {validateJob,decodeUtf8} from './contracts.mjs';
export async function main(args=process.argv.slice(2),input=process.stdin) {
  if(args.length!==3||args[0]!=='run'||args[1]!=='--candidate')throw Error('INVALID_COMMAND');
  candidate(args[2]);let bytes=0;const chunks=[];for await(const c of input){bytes+=Buffer.byteLength(c);if(bytes>65536)throw Error('INPUT_TOO_LARGE');chunks.push(c);}
  const job=validateJob(JSON.parse(decodeUtf8(Buffer.concat(chunks.map(c=>Buffer.from(c))))));
  const client=createOllamaClient();const expectedSnapshot=await client.inspectCandidate(args[2]);
  return runJob(job,{candidateId:args[2],expectedSnapshot,client,runtimeDir:path.join(path.dirname(fileURLToPath(import.meta.url)),'.local-runtime')});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(o=>{console.log(JSON.stringify(o));if(o.status!=='succeeded')process.exitCode=1;}).catch(()=>{console.log(JSON.stringify({status:'rejected',reasonCode:'INVALID_COMMAND_OR_INPUT'}));process.exitCode=2;});
