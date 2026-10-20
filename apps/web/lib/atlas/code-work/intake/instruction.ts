/**
 * Explicit code-work planning instruction shared by text and STT voice turns.
 * No model interpretation, ambient file discovery, provider or authority.
 * A successful parse STILL needs a server-trusted repository/base binding,
 * WorkPackage verification and an independent human authorization.
 */
import {prepareCodeWorkIntakePreview,type IntakeContext,type IntakeInput,type IntakePreview} from './preview'

export const CODE_WORK_INSTRUCTION_V1='atlas.code_work_instruction.v1' as const
type Source='text'|'voice'
export type InstructionResult=
 | {status:'not_code_work_intent'}
 | {status:'needs_details';missing:('objective'|'kind'|'writePaths')[];example:string}
 | {status:'invalid';reason:string}
 | {status:'ready_for_binding';schema:typeof CODE_WORK_INSTRUCTION_V1;request:IntakeInput;inputSource:Source}
export type BoundInstructionResult=
 | Exclude<InstructionResult,{status:'ready_for_binding'}>
 | {status:'binding_required';reason:'trusted_repository_base_unavailable'}
 | {status:'awaiting_human_approval';preview:IntakePreview}

const INTRO=/^(?:atlas\s*[,.:]?\s*)?(?:planera\s+(?:ett\s+)?kodjobb|skapa\s+(?:ett\s+)?kodjobbsförslag|prepare\s+code\s+work\s+proposal)\s*:/i
const VOICE_INTRO=/^(?:atlas\s*[,.:]?\s*)?(?:planera\s+(?:ett\s+)?kodjobb|skapa\s+(?:ett\s+)?kodjobbsförslag)\s+att\s+/i
const KINDS:ReadonlyMap<string,IntakeInput['kind']>=new Map([
 ['ui_fix','ui_fix'],['ui-fix','ui_fix'],['gränssnitt','ui_fix'],['bugfix','bugfix'],
 ['buggfix','bugfix'],['bugg','bugfix'],['feature','feature'],['funktion','feature'],
 ['refactor','refactor'],['refaktorering','refactor'],
])
const EXAMPLE='Atlas, planera kodjobb: Rätta etiketterna | typ: ui_fix | filer: apps/web/lib/ui/display-preferences.ts'

export function parseCodeWorkInstruction(message:unknown,inputSource:Source):InstructionResult{
 if(typeof message!=='string'||!['text','voice'].includes(inputSource))return{status:'not_code_work_intent'}
 const utterance=message.trim()
 const m=INTRO.exec(utterance)??(inputSource==='voice'?VOICE_INTRO.exec(utterance):null)
 if(!m)return{status:'not_code_work_intent'}
 const rest=utterance.slice(m[0].length)
 if(rest.length>4000)return{status:'invalid',reason:'instruction_too_long'}
 const parts=rest.split(/\s*(?:\||;|\n)\s*/)
 if(parts.length>3)return{status:'invalid',reason:'too_many_instruction_fields'}
 const objective=parts[0]?.trim()??''
 let kind:IntakeInput['kind']|null=null,writePaths:string[]=[]
 let seenKind=false,seenFiles=false
 for(const field of parts.slice(1)){
  const match=/^(typ|type|filer|files)\s*:\s*(.*)$/i.exec(field)
  if(!match)return{status:'invalid',reason:'unknown_instruction_field'}
  const name=match[1].toLowerCase(),value=match[2].trim()
  if(name==='typ'||name==='type'){
   if(seenKind)return{status:'invalid',reason:'duplicate_kind'}
   seenKind=true
   kind=KINDS.get(value.toLowerCase())??null
  }else{
   if(seenFiles)return{status:'invalid',reason:'duplicate_files'}
   seenFiles=true
   writePaths=value.split(/\s*,\s*/).map(v=>v.trim()).filter(Boolean)
  }
 }
 const missing:('objective'|'kind'|'writePaths')[]=[]
 if(!objective)missing.push('objective')
 if(!seenKind)missing.push('kind')
 if(!seenFiles||writePaths.length===0)missing.push('writePaths')
 if(missing.length)return{status:'needs_details',missing,example:EXAMPLE}
 if(!kind)return{status:'invalid',reason:'unknown_kind'}
 if(objective.length>1500||writePaths.length>8)return{status:'invalid',reason:'instruction_bounds'}
 return{status:'ready_for_binding',schema:CODE_WORK_INSTRUCTION_V1,
  request:{objective,kind,writePaths},inputSource}
}

/** Never persist, dispatch or approve from a voice/text parse; exact trusted
 * repository/base/model bindings are mandatory before producing a preview. */
export function prepareInstructionPreview(message:unknown,inputSource:Source,context:IntakeContext|null):BoundInstructionResult{
 const parsed=parseCodeWorkInstruction(message,inputSource)
 if(parsed.status!=='ready_for_binding')return parsed
 if(!context)return{status:'binding_required',reason:'trusted_repository_base_unavailable'}
 try{return{status:'awaiting_human_approval',preview:prepareCodeWorkIntakePreview(parsed.request,context)}}
 catch{return{status:'invalid',reason:'scope_or_binding_rejected'}}
}
