/**
 * One-shot, workstation-only creative broker pilot.
 * NO network listener, no production queue, no arbitrary MCP tools/call.
 * External execution requires explicit --pilot-approve in the invocation.
 * Only synthetic/locally-approved inputs under _atlas_test_only are accepted.
 * The pilot flag is NOT an authentication mechanism or an OS sandbox.
 * Do not expose this command to remote agents or untrusted project media.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync, lstatSync, readFileSync, realpathSync, mkdirSync,
  statSync, writeFileSync,
} from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const lock = JSON.parse(readFileSync(new URL('./artcraft-lock.json', import.meta.url), 'utf8'));
const extRoot = process.env.OMNIRA_ARTCRAFT_ROOT ??
  join(homedir(), 'Projects', 'Omnira', 'External', 'ArtCraft');
const pilot = join(extRoot, '_atlas_test_only');
const inputDir = join(pilot, 'input');
const outputDir = join(pilot, 'output');
const auditDir = join(pilot, 'audit');
const requestDir = join(pilot, 'requests');
export const PILOT_OPERATIONS = Object.freeze(['photocraft.convert-webp', 'filmcraft.demo-export-mp4']);

export function validateJob(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('job must be an object');
  const { id, operation } = value;
  if (typeof id !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{2,39}$/.test(id)) throw new Error('invalid job id');
  if (!PILOT_OPERATIONS.includes(operation)) throw new Error('operation not allowlisted');
  const allowed = operation === 'photocraft.convert-webp'
    ? ['id', 'operation', 'inputName', 'quality'] : ['id', 'operation'];
  if (Object.keys(value).some(k => !allowed.includes(k))) throw new Error('unexpected job properties');
  if (operation === 'photocraft.convert-webp') {
    if (typeof value.inputName !== 'string' ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,75}\.png$/.test(value.inputName)) {
      throw new Error('input must be a simple PNG filename');
    }
    if (!Number.isInteger(value.quality) || value.quality < 55 || value.quality > 92) {
      throw new Error('quality must be integer 55..92');
    }
  }
  return Object.freeze({ ...value });
}
function pinnedBinary(name) {
  const config = lock[name];
  if (!config) throw new Error('missing binary lock');
  const bin = resolve(extRoot, config.binaryRelativePath);
  if (!existsSync(bin) || !lstatSync(bin).isFile()) throw new Error('binary missing or not regular file');
  const hash = createHash('sha256').update(readFileSync(bin)).digest('hex');
  if (hash.toLowerCase() !== config.sha256.toLowerCase()) throw new Error('binary checksum changed');
  return bin;
}
function ensureDirectory(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
  if (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink()) {
    throw new Error('unsafe directory');
  }
}
function insideReadRoot(path, root, maxBytes) {
  const r = realpathSync.native(root);
  const p = realpathSync.native(path);
  if (!p.toLowerCase().startsWith((r + sep).toLowerCase())) throw new Error('input escaped test staging');
  if (!lstatSync(p).isFile() || lstatSync(p).isSymbolicLink()) throw new Error('unsafe input');
  const bytes = statSync(p).size;
  if (bytes < 20 || bytes > maxBytes) throw new Error('unsupported input size');
  return p;
}
function execPinned(bin, args, timeout) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, {
      cwd: pilot, windowsHide: true, shell: false, timeout,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env },
    }, (error, stdout, stderr) => {
      if (error) return reject(new Error('editor failed: ' + String(error.message).slice(0,300)));
      resolve({ stdout: stdout.slice(-800), stderr: stderr.slice(-800) });
    });
  });
}
function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
function hasExpectedMediaHeader(path, kind) {
  const bytes = readFileSync(path);
  if (kind === 'photocraft') return bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  return bytes.subarray(4, 8).toString('ascii') === 'ftyp';
}
export async function runPilotJob(rawJob, approve = false) {
  const job = validateJob(rawJob);
  if (approve !== true) throw new Error('local pilot execution requires explicit operator approval');
  for (const dir of [pilot, inputDir, outputDir, auditDir, requestDir]) ensureDirectory(dir);
  const outputName = job.id + (job.operation === 'photocraft.convert-webp' ? '.webp' : '.mp4');
  const outputPath = join(outputDir, outputName);
  if (existsSync(outputPath)) throw new Error('output exists; refusing overwrite');
  const auditPath = join(auditDir, job.id + '.json');
  if (existsSync(auditPath)) throw new Error('job already audited');
  const started = Date.now();
  const name = job.operation.startsWith('photocraft.') ? 'photocraft' : 'filmcraft';
  const bin = pinnedBinary(name);
  let inputHash = null;
  let args;
  if (name === 'photocraft') {
    const src = insideReadRoot(join(inputDir, job.inputName), inputDir, 20 * 1024 * 1024);
    inputHash = sha256File(src);
    args = ['convert', src, outputPath, '--quality', String(job.quality)];
  } else {
    // Synthetic demo only. Real film edits need a project-constrained sandbox.
    args = ['--demo', 'export', outputPath, '--format', 'h264',
      '--range', 'entire', '--scale', '0.1', '--no-audio'];
  }
  let result;
  try {
    result = await execPinned(bin, args, name === 'photocraft' ? 20000 : 45000);
    if (!existsSync(outputPath)) throw new Error('output was not created');
    const stat = lstatSync(outputPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 50 ||
      stat.size > 40 * 1024 * 1024) throw new Error('invalid output size');
    if (!hasExpectedMediaHeader(outputPath, name)) throw new Error('invalid output file header');
    const record = {
      jobId: job.id, operation: job.operation, status: 'staged-not-published',
      toolVersion: lock[name].version, binaryHash: lock[name].sha256,
      inputHash, outputName, outputHash: sha256File(outputPath),
      outputBytes: stat.size, durationMs: Date.now() - started,
      previewOnly: true, requiresHumanReview: true,
      stderrNote: result.stderr,
    };
    writeFileSync(auditPath, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
    return record;
  } catch (error) {
    const record = { jobId: job.id, operation: job.operation, status: 'failed',
      durationMs: Date.now() - started, reason: String(error.message).slice(0,350) };
    if (!existsSync(auditPath)) writeFileSync(auditPath, JSON.stringify(record, null, 2) + '\n', {flag: 'wx'});
    throw error;
  }
}
function parseArgs(argv) {
  if (argv.length !== 3 || argv[0] !== '--job' ||
      !['--validate', '--pilot-approve'].includes(argv[2])) {
    throw new Error('Usage: node local-broker.mjs --job <job-id> (--validate | --pilot-approve)');
  }
  const id = argv[1];
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{2,39}$/.test(id)) throw new Error('invalid job id');
  return { id, mode: argv[2] };
}
if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase()) {
  try {
    const { id, mode } = parseArgs(process.argv.slice(2));
    const request = insideReadRoot(join(requestDir, id + '.json'), requestDir, 8192);
    const job = validateJob(JSON.parse(readFileSync(request, 'utf8').replace(/^\uFEFF/, '')));
    if (job.id !== id) throw new Error('request id mismatch');
    if (mode === '--validate') {
      console.log(JSON.stringify({ jobId: id, operation: job.operation,
        status: 'valid-but-not-authorized', executionAuthorized: false }));
    } else {
      const result = await runPilotJob(job, true);
      console.log(JSON.stringify(result));
    }
  } catch (error) {
    console.error('REFUSED:', String(error.message).slice(0,360));
    process.exitCode = 1;
  }
}
