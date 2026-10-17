export type {
  Task, TaskResult, RequestLocalText, JobState, JobReceipt, VerifiedContext,
  SelectionDecision, Claim, ReviewReceipt, TransitionResult, WorkerOperation,
  WorkerEnvelope, UnsignedWorkerEnvelope,
} from '@omnira/local-text-contract'
import type { createAdminClient } from '@/lib/supabase/admin'
export type Db = ReturnType<typeof createAdminClient>
export type Clock = () => Date
