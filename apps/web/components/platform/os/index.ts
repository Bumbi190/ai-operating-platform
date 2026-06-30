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
export { OSPage, OSLayer, OSGrid } from './OSPage'

// Bars & chrome
export { CommandBar } from './CommandBar'
export { CommandPalette } from './CommandPalette'
export { AtlasActionChips } from './AtlasActionChips'

// Business command center
export { DashboardHero } from './DashboardHero'
export { BusinessCard } from './BusinessCard'
export { QuickAdd } from './QuickAdd'
export { ProactiveNudge } from './ProactiveNudge'
export { AgenticButton } from './AgenticButton'

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

// Atlas voice UI
export { AtlasOrb, type OrbPhase } from './AtlasOrb'
export { AtlasMiniOrb } from './AtlasMiniOrb'

// Global voice assistant
export { VoiceAssistant } from './VoiceAssistant'

// Atlas view-awareness page wiring (selection / visible)
export { ViewVisibleSync, ViewSelectionSync } from './ViewSync'
