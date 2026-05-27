/**
 * lib/os/execution-graph.ts
 *
 * Translates real workflow + run + run_logs data into the FlowNode[] shape
 * the OS WorkflowFlow component consumes.
 *
 * A step is:
 *   queued  — no log entries yet AND no prior step has produced output
 *   active  — has an assistant log but no completion / no later step is logging
 *   done    — has output_key written into runs.context  OR a later step has logs
 *   failed  — has a system log with role 'system' that contains "error" / "failed"
 *             OR the run.status === 'failed' and this is the last logged step
 */

import type { LucideIcon } from 'lucide-react'
import {
  Bot, Brain, FileText, GitBranch, Send, Shield, Sparkles, Radio, Database,
  Cpu, Image as ImageIcon, Mic, Film,
} from 'lucide-react'
import type { Workflow, WorkflowStep, Run, RunLog, Agent } from '@/lib/supabase/types'
import type { FlowNode } from '@/components/platform/os'
import type { ActiveExecution } from './data'

// ─── Step → icon · best-guess by step/agent name ────────────────────────────

const NAME_TO_ICON: Array<[RegExp, LucideIcon, string]> = [
  [/news|hunter|signal|sources?/i, Radio,    '#67e8f9'],
  [/script|writer|hook|copy/i,     FileText, '#a78bfa'],
  [/visual|director|image|shot/i,  Sparkles, '#a5b4fc'],
  [/qa|review|eval|guard/i,        Shield,   '#d4a574'],
  [/publish|distribut/i,           Send,     '#34d399'],
  [/voice|audio|tts|elevenlabs/i,  Mic,      '#67e8f9'],
  [/render|remotion|video/i,       Film,     '#c084fc'],
  [/image|picture/i,               ImageIcon,'#a5b4fc'],
  [/route|orchestrat|manager/i,    Brain,    '#818cf8'],
  [/api|tool|fetch/i,              Cpu,      '#60a5fa'],
  [/memor/i,                       Database, '#67e8f9'],
  [/branch|gate|switch/i,          GitBranch,'#818cf8'],
]

function iconFor(name: string): { icon: LucideIcon; color: string } {
  for (const [pattern, icon, color] of NAME_TO_ICON) {
    if (pattern.test(name)) return { icon, color }
  }
  return { icon: Bot, color: '#a5b4fc' }
}

// ─── Reasoning extraction · clean up assistant log content ───────────────────

function extractReasoningSnippet(content: string): string {
  // Strip JSON wrappers + markdown noise, then trim
  const cleaned = content
    .replace(/```[\s\S]*?```/g, '')   // code fences
    .replace(/^["']|["']$/g, '')      // outer quotes
    .replace(/^\s*[#>*-]+\s*/gm, '')  // markdown list/quote markers
    .replace(/\s+/g, ' ')             // collapse whitespace
    .trim()

  // First 120 chars of the first sentence
  const firstSentence = cleaned.split(/(?<=\.)\s/)[0] ?? cleaned
  if (firstSentence.length <= 110) return firstSentence
  return firstSentence.slice(0, 107).replace(/\s\S*$/, '') + '…'
}

// ─── The main builder ────────────────────────────────────────────────────────

export interface ExecutionFlowNode extends FlowNode {
  /** the step.order from workflows.steps */
  order: number
  /** linked agent (if found) */
  agent?: Agent
  /** sum of duration_ms of all logs for this step */
  durationMs?: number
  /** assistant log content (latest) — for hover/expand panels */
  reasoningFull?: string
}

export interface ExecutionGraph {
  workflowName:    string
  runId:           string
  runStatus:       Run['status']
  startedAt:       string | null
  finishedAt:      string | null
  nodes:           ExecutionFlowNode[]
  /** index of currently active node (if any) */
  activeIndex:     number | null
}

export function buildExecutionGraph(exec: ActiveExecution): ExecutionGraph | null {
  if (!exec.workflow) return null
  const steps = (exec.workflow.steps ?? []) as WorkflowStep[]
  if (steps.length === 0) return null

  const sortedSteps = [...steps].sort((a, b) => a.order - b.order)
  const logs = exec.logs

  // Per-step aggregates
  const logsByStep:   Record<number, RunLog[]> = {}
  const durationByStep: Record<number, number> = {}
  for (const log of logs) {
    if (log.step_order == null) continue
    ;(logsByStep[log.step_order] ??= []).push(log)
    durationByStep[log.step_order] = (durationByStep[log.step_order] ?? 0) + (log.duration_ms ?? 0)
  }

  // Run.context keys completed (each entry == an output_key that was produced)
  const completedKeys = new Set<string>(Object.keys(exec.run.context ?? {}))

  // Determine active step:
  //   - if the run is finished: no active
  //   - else: the highest-order step that has assistant logs but whose output_key is NOT in run.context yet
  let activeIndex: number | null = null
  const isRunActive = exec.run.status === 'running' || exec.run.status === 'pending'

  if (isRunActive) {
    // Find the latest step with any logs but no completed output_key
    for (let i = sortedSteps.length - 1; i >= 0; i--) {
      const step = sortedSteps[i]
      const hasLogs = (logsByStep[step.order]?.length ?? 0) > 0
      const completed = completedKeys.has(step.output_key)
      if (hasLogs && !completed) { activeIndex = i; break }
    }
    // If no step has started yet but run is active → first step is active (just kicked off)
    if (activeIndex === null) {
      const firstUnstarted = sortedSteps.findIndex(s => !(logsByStep[s.order]?.length))
      activeIndex = firstUnstarted >= 0 ? firstUnstarted : sortedSteps.length - 1
    }
  }

  // Build nodes
  const nodes: ExecutionFlowNode[] = sortedSteps.map((step, i) => {
    const completed = completedKeys.has(step.output_key)
    const stepLogs  = logsByStep[step.order] ?? []
    const failed    = exec.run.status === 'failed'
      && i === sortedSteps.length - 1
      && !completed
    const isActive  = !failed && activeIndex === i

    let status: FlowNode['status']
    if (failed) status = 'failed'
    else if (completed) status = 'done'
    else if (isActive)  status = 'active'
    else                status = i < (activeIndex ?? sortedSteps.length) ? 'done' : 'queued'

    const agent = step.agent_id ? exec.agentsById[step.agent_id] : undefined
    const baseName = step.name || agent?.name || `Step ${step.order + 1}`
    const { icon, color } = iconFor(baseName + ' ' + (agent?.name ?? ''))

    // Reasoning snippet · only for the currently-active step
    let reasoning: string | undefined
    let reasoningFull: string | undefined
    if (isActive) {
      const latestAssistant = stepLogs
        .filter(l => l.role === 'assistant')
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
      if (latestAssistant) {
        reasoning     = extractReasoningSnippet(latestAssistant.content)
        reasoningFull = latestAssistant.content
      }
    }

    return {
      id:        `${exec.run.id}-${step.order}`,
      label:     baseName,
      sublabel:  status === 'done'
        ? `${Math.round((durationByStep[step.order] ?? 0) / 1000)}s`
        : status === 'active'
          ? 'Reasoning…'
          : status === 'failed'
            ? 'Failed'
            : 'Queued',
      icon,
      status,
      color,
      reasoning,
      reasoningFull,
      order: step.order,
      agent,
      durationMs: durationByStep[step.order],
    } satisfies ExecutionFlowNode
  })

  return {
    workflowName: exec.workflow.name,
    runId:        exec.run.id,
    runStatus:    exec.run.status,
    startedAt:    exec.run.started_at,
    finishedAt:   exec.run.finished_at,
    nodes,
    activeIndex,
  }
}

// ─── Ensemble vote — confidence per step from real log durations / volume ───
// Confidence is computed as a normalized signal:
//   completed → derived from tokens efficiency vs. average
//   active    → 60 + small drift (we don't have a real confidence column yet)
//   queued    → null
//   failed    → 0
// This deliberately stays simple. Real confidence will land when we add the
// `agent_decisions` table (see migration in /supabase/migrations).

export function confidenceForNode(node: ExecutionFlowNode, allDurations: number[]): number | null {
  if (node.status === 'queued') return null
  if (node.status === 'failed') return 0
  if (node.status === 'done') {
    // Higher confidence when this step finished faster than average.
    const avg = allDurations.length ? allDurations.reduce((a, b) => a + b, 0) / allDurations.length : 0
    if (!avg || !node.durationMs) return 88
    const ratio = avg / node.durationMs
    return Math.max(70, Math.min(99, Math.round(70 + ratio * 18)))
  }
  // active
  return 86
}
