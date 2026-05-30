// Design system source of truth
export * from './system'

// Surfaces & primitives
export { Panel, PanelHeader } from './Panel'
export { Sparkline, MiniBars, RadialDial } from './Sparkline'
export { PulseDot, StatusChip } from './PulseDot'
export { HeroStat } from './HeroStat'
export { Instrument, InstrumentCluster } from './Instrument'
export { DotMatrix, NowBadge } from './DotMatrix'
export { Stage, SectionHeader } from './Stage'

// Bars & chrome
export { CommandBar } from './CommandBar'

// Mission systems
export { AgentCard, type AgentSnapshot } from './AgentCard'
export { WorkflowFlow, type FlowNode } from './WorkflowFlow'
export { ReasoningTrace, ScoreBar, type ReasoningStep } from './ReasoningTrace'
export { ActivityRail, type ActivityEvent, type ActivityEventType } from './ActivityRail'
export { MemoryGraph, type MemoryNode, type MemoryEdge } from './MemoryGraph'
export { PublishPipeline, type PublishItem } from './PublishPipeline'

// Mission state hierarchy
export { MissionState, TierBadge } from './MissionState'

// OS identity moments
export { StreamingText } from './StreamingText'
export { MicroTicker } from './MicroTicker'
export { EmptyState } from './EmptyState'
export { SystemReadyBanner } from './SystemReadyBanner'
export { IdentityCard } from './IdentityCard'

// AI cognition layer
export {
  AgentThinking,
  ConfidenceMeter,
  Recommendation,
  MemoryRecall,
  AutonomousWarning,
  OrchestrationReasoning,
} from './cognition'

// Operator modes
export {
  OperatorModeProvider,
  useOperatorMode,
  OperatorModeSwitcher,
  ModeIndicator,
} from './OperatorMode'

// Mobile companion
export { MobileRailToggle } from './MobileRailToggle'
