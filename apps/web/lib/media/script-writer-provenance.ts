/**
 * The Prompt — server-stamped script-writer provenance.
 *
 * NEVER accept provenance from the model's JSON script fields. Model identity
 * comes from the actual provider SDK response, after the governed dispatch.
 * This is an attribution record, NOT an editorial fact-check or publish grant.
 *
 * Absence of verifiable provider response metadata is intentionally retained
 * as null; an unknown model never gets guessed from the requested model name.
 */
import {createHash} from 'node:crypto'
import type {ScriptWriterOutput} from './types'

export const SCRIPT_WRITER_PROVENANCE = 'provider_response_v1' as const

export type ScriptOutputForProvenance = Pick<ScriptWriterOutput,
  'hook'|'script'|'captions'|'hashtags'|'cta'|'tone'|'estimated_duration'>
export type ServerWriterIdentity = Readonly<{
  writer_model:string
  writer_provider:'anthropic'|'openai'
  writer_provenance:typeof SCRIPT_WRITER_PROVENANCE
  writer_version:number
  writer_content_sha256:string
}>
export type SanitizedScriptOutput = ScriptWriterOutput & Partial<ServerWriterIdentity> & {
  writer_model?:string|null
  writer_provider?:'anthropic'|'openai'|null
  writer_provenance?:typeof SCRIPT_WRITER_PROVENANCE|null
  writer_version?:number|null
  writer_content_sha256?:string|null
}

function text(value:unknown):string|null {
  return typeof value==='string' && value.length>0 && value.length<=10000
    ? value : null
}
function strings(value:unknown):string[]|null {
  return Array.isArray(value) && value.length<=30 &&
    value.every(v=>typeof v==='string' && v.length<=3000)
    ? [...value] : null
}

export function scriptAuthorDigest(
  version:number,
  fields:ScriptOutputForProvenance,
):string|null {
  if (!Number.isSafeInteger(version) || version<1 ||
      !text(fields?.hook) || !text(fields?.script) ||
      !text(fields?.cta) || !text(fields?.tone) ||
      !text(fields?.estimated_duration) ||
      !strings(fields?.captions) || !strings(fields?.hashtags)) return null
  const tuple=[
    version,fields.hook,fields.script,fields.captions,
    fields.hashtags,fields.cta,fields.tone,fields.estimated_duration,
  ]
  return createHash('sha256').update(JSON.stringify(tuple)).digest('hex')
}

/**
 * Anthropic: provider Message object with matching model/type/id.
 * Governed OpenAI reserve: our adapter itself tags this specific return path.
 * The requested input.model is NEVER consulted.
 */
export function serverWriterIdentity(
  providerResponse:unknown, script:ScriptOutputForProvenance, version:number,
):ServerWriterIdentity|null {
  const checksum=scriptAuthorDigest(version,script)
  if (!checksum || !providerResponse ||
      typeof providerResponse!=='object' || Array.isArray(providerResponse)) return null
  const response=providerResponse as Record<string,unknown>
  const model=response.model
  if (typeof model!=='string' || model.length>100) return null
  let provider:ServerWriterIdentity['writer_provider']
  if (/^claude-[a-z0-9.-]+$/i.test(model) &&
      response.type==='message' &&
      typeof response.id==='string' && response.id.startsWith('msg_')) {
    provider='anthropic'
  } else if (/^gpt-[a-z0-9.-]+$/i.test(model) &&
      response.writer_transport==='governed_openai_reserve_v1') {
    provider='openai'
  } else return null
  return Object.freeze({
    writer_model:model,writer_provider:provider,
    writer_provenance:SCRIPT_WRITER_PROVENANCE,
    writer_version:version,writer_content_sha256:checksum,
  })
}

/**
 * Whitelist script fields before persisting LLM-supplied JSON. Never allow a
 * model response or user-supplied workflow JSON to smuggle writer_model or any
 * of the server-only provenance fields.
 */
export function stampedScriptOutput(
  parsed:ScriptWriterOutput, providerResponse:unknown, version:number,
):SanitizedScriptOutput {
  const source=parsed as unknown as Record<string,unknown>
  const cleaned:ScriptWriterOutput = {
    hook:source.hook as string,
    script:source.script as string,
    captions:source.captions as string[],
    hashtags:source.hashtags as string[],
    cta:source.cta as string,
    tone:source.tone as ScriptWriterOutput['tone'],
    estimated_duration:source.estimated_duration as string,
    difficulty:source.difficulty as ScriptWriterOutput['difficulty'],
  }
  const identity=serverWriterIdentity(providerResponse,cleaned,version)
  return {
    ...cleaned,
    writer_model:identity?.writer_model??null,
    writer_provider:identity?.writer_provider??null,
    writer_provenance:identity?.writer_provenance??null,
    writer_version:identity?.writer_version??null,
    writer_content_sha256:identity?.writer_content_sha256??null,
  }
}

/** Validate the server stamp against the CURRENT persisted columns. */
export function verifiedStoredWriterModel(
  raw:unknown,
  script:ScriptOutputForProvenance & {version:number},
):string|null {
  if (!raw || typeof raw!=='object' || Array.isArray(raw)) return null
  const info=raw as Record<string,unknown>
  if (info.writer_provenance!==SCRIPT_WRITER_PROVENANCE ||
      typeof info.writer_model!=='string' ||
      !Number.isSafeInteger(info.writer_version) ||
      info.writer_version!==script.version) return null
  const digest=scriptAuthorDigest(script.version,script)
  if (!digest || info.writer_content_sha256!==digest) return null
  if (info.writer_provider==='anthropic' &&
      /^claude-[a-z0-9.-]+$/i.test(info.writer_model)) return info.writer_model
  if (info.writer_provider==='openai' &&
      /^gpt-[a-z0-9.-]+$/i.test(info.writer_model)) return info.writer_model
  return null
}
