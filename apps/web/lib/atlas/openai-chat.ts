import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import type OpenAI from 'openai'
import type { OpenAIGovernanceContext } from '@/lib/ai/openai-client'
import { calculateCost } from '@/lib/ai/pricing'
import { tokenWindowCeiling } from '@/lib/cost/spend-ceiling'

export type AtlasChatProvider = 'anthropic' | 'openai'
export function resolveAtlasChatProvider(env: { ATLAS_CHAT_PROVIDER?: string }): AtlasChatProvider {
  const provider = env.ATLAS_CHAT_PROVIDER?.trim() || 'anthropic'
  if (provider !== 'anthropic' && provider !== 'openai') throw new Error('Unsupported Atlas chat provider')
  return provider
}

// This pilot answers questions and reads existing state. It cannot start paid
// subagents, workflows or builds through a tool, even if a model asks for one.
const READ_TOOLS = new Set([
  'get_current_time', 'list_atlas_workflow_catalog', 'list_workflows',
  'get_run_status', 'get_dream_findings', 'present_links', 'navigate', 'get_records',
])
export function isAtlasOpenAIReadTool(name: string): boolean { return READ_TOOLS.has(name) }

export class OpenAIPilotBudget {
  private used = 0
  private readonly limit: number
  constructor(limitUsd = 1) {
    if (!Number.isFinite(limitUsd) || limitUsd <= 0) throw new Error('Invalid pilot budget')
    this.limit = Math.floor(limitUsd * 1e9)
  }
  // Synchronous reservation protects concurrent requests in this Node process.
  // Hot reload shares the instance below. A process restart starts a NEW pass;
  // this is deliberately not an account-wide or monthly spending limit.
  reserve(ceilingUsd: number): (actualUsd?: number) => void {
    const reserved = Math.ceil(ceilingUsd * 1e9)
    if (!Number.isFinite(reserved) || reserved <= 0 || this.used + reserved > this.limit) {
      throw Object.assign(new Error('Local Atlas pilot budget exhausted'), { code: 'ATLAS_PILOT_BUDGET_EXHAUSTED' })
    }
    this.used += reserved
    let settled = false
    return actualUsd => {
      if (settled) return
      settled = true
      // Missing usage, ambiguous transport failure or invalid usage retains the
      // complete reservation. A verified pre-inference rejection settles at 0.
      if (actualUsd !== undefined && Number.isFinite(actualUsd) && actualUsd >= 0 && actualUsd <= ceilingUsd) {
        this.used -= reserved - Math.ceil(actualUsd * 1e9)
      }
    }
  }
}
const processState = globalThis as typeof globalThis & { __atlasOpenAIPilotBudget?: OpenAIPilotBudget }
function sharedBudget(): OpenAIPilotBudget {
  return processState.__atlasOpenAIPilotBudget ??= new OpenAIPilotBudget(1)
}

type Input = Anthropic.MessageStreamParams
type Result = Pick<Anthropic.Message, 'stop_reason' | 'content'>
type Message = OpenAI.Chat.ChatCompletionMessageParam

function textOnly(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) throw new Error('Unsupported Atlas message content')
  return content.map(block => {
    if (block?.type !== 'text' || typeof block.text !== 'string') throw new Error('Unsupported Atlas content block')
    return block.text
  }).join('\n')
}

function messagesFor(input: Input): Message[] {
  const out: Message[] = input.system ? [{ role: 'developer', content: textOnly(input.system) }] : []
  for (const message of input.messages) {
    if (typeof message.content === 'string') {
      out.push({ role: message.role, content: message.content })
      continue
    }
    if (!Array.isArray(message.content)) throw new Error('Unsupported Atlas message')
    if (message.role === 'assistant') {
      let text = ''
      const calls: OpenAI.Chat.ChatCompletionMessageToolCall[] = []
      for (const block of message.content) {
        if (block.type === 'text') text += block.text
        else if (block.type === 'tool_use') {
          calls.push({ id: block.id, type: 'function', function: { name: block.name, arguments: JSON.stringify(block.input) } })
        } else throw new Error('Unsupported Atlas assistant block')
      }
      out.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) })
    } else if (message.content.every(block => block.type === 'tool_result')) {
      for (const block of message.content) {
        if (block.type !== 'tool_result') throw new Error('Unsupported Atlas tool result')
        const content = textOnly(block.content ?? '')
        out.push({ role: 'tool', tool_call_id: block.tool_use_id, content: block.is_error ? '[TOOL ERROR] ' + content : content })
      }
    } else {
      out.push({ role: 'user', content: textOnly(message.content) })
    }
  }
  return out
}

export function createAtlasOpenAIStream(
  ctx: OpenAIGovernanceContext,
  input: Input,
  budget: OpenAIPilotBudget = sharedBudget(),
  signal?: AbortSignal,
) {
  const listeners: Array<(delta: string) => void> = []
  let final: Promise<Result> | undefined
  const run = async (): Promise<Result> => {
    const messages = messagesFor(input) // Unsupported content is refused BEFORE dispatch.
    const tools = (input.tools ?? []).filter(tool => isAtlasOpenAIReadTool(tool.name))
    const cap = Math.min(input.max_tokens, 1200)
    if (!Number.isInteger(cap) || cap <= 0) throw new Error('Invalid Atlas output cap')
    const requested = input.tool_choice
    if (requested?.type === 'tool' && !tools.some(tool => tool.name === requested.name)) {
      throw new Error('Tool unavailable in the read-only Atlas pilot')
    }
    // SDK 4 predates Luna's none effort/cache options, but passes JSON fields
    // through unchanged. Keep those documented fields local to this adapter.
    const request = {
      model: 'gpt-6-luna', messages, max_completion_tokens: cap,
      reasoning_effort: 'none', service_tier: 'default', store: false,
      prompt_cache_options: { mode: 'explicit' }, // No breakpoints: no cache writes.
      stream: true, stream_options: { include_usage: true },
      ...(tools.length ? {
        tools: tools.map(tool => ({ type: 'function', function: {
          name: tool.name, description: tool.description, parameters: tool.input_schema,
        } })),
        tool_choice: requested?.type === 'tool'
          ? { type: 'function', function: { name: requested.name } }
          : requested?.type === 'any' ? 'required' : 'auto',
        parallel_tool_calls: false,
      } : {}),
    } as unknown as OpenAI.Chat.ChatCompletionCreateParamsStreaming
    const ceiling = tokenWindowCeiling('gpt-6-luna', cap, { usd_sek: 1 })
    if (!ceiling.ok) throw new Error('Luna has no safe spending ceiling')
    const finish = budget.reserve(ceiling.sek) // USD because this snapshot has FX = 1.
    let actual: number | undefined
    try {
      const { openAIChatCompletion } = await import('@/lib/ai/openai-client')
      const stream = await openAIChatCompletion(ctx, request, { signal })
      let text = ''
      let stop: string | null = null
      const calls = new Map<number, { id: string; name: string; arguments: string }>()
      for await (const chunk of stream) {
        const usage = chunk.usage
        if (usage && Number.isInteger(usage.prompt_tokens) && usage.prompt_tokens >= 0 && usage.prompt_tokens <= 1_050_000
          && Number.isInteger(usage.completion_tokens) && usage.completion_tokens >= 0 && usage.completion_tokens <= cap) {
          actual = calculateCost('gpt-6-luna', usage.prompt_tokens, usage.completion_tokens)
        }
        const choice = chunk.choices?.find((item: { index: number }) => item.index === 0)
        if (!choice) continue
        if (choice.finish_reason) stop = choice.finish_reason
        const delta = choice.delta
        if (typeof delta?.content === 'string' && delta.content) {
          text += delta.content
          for (const listener of listeners) listener(delta.content)
        }
        for (const part of delta?.tool_calls ?? []) {
          const call = calls.get(part.index) ?? { id: '', name: '', arguments: '' }
          call.id += part.id ?? ''
          call.name += part.function?.name ?? ''
          call.arguments += part.function?.arguments ?? ''
          calls.set(part.index, call)
        }
      }
      // A partial/truncated call is never handed to the tool executor.
      const cappedText = stop === 'length' && calls.size === 0 && text.length > 0
      if (stop !== 'stop' && stop !== 'tool_calls' && !cappedText) throw new Error('Atlas completion did not finish')
      const content: Anthropic.ContentBlock[] = text ? [{ type: 'text', text, citations: null }] : []
      const ids = new Set<string>()
      for (const call of calls.values()) {
        if (stop !== 'tool_calls' || !call.id || ids.has(call.id) || !tools.some(tool => tool.name === call.name)) {
          throw new Error('Invalid Atlas tool call')
        }
        ids.add(call.id)
        const args: unknown = JSON.parse(call.arguments)
        if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid Atlas tool arguments')
        content.push({ type: 'tool_use', id: call.id, name: call.name, input: args })
      }
      if (!content.length || (stop === 'tool_calls' && !calls.size)) throw new Error('Empty Atlas completion')
      return { content, stop_reason: stop === 'tool_calls' ? 'tool_use' : cappedText ? 'max_tokens' : 'end_turn' }
    } catch (error) {
      const status = (error as { status?: unknown })?.status
      if ([400, 401, 403, 404, 422].includes(status as number)) actual = 0
      throw error
    } finally {
      finish(actual)
    }
  }
  return {
    on(_event: 'text', listener: (delta: string) => void) { listeners.push(listener) },
    finalMessage(): Promise<Result> { return final ??= run() },
  }
}
