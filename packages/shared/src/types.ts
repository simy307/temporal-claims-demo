/**
 * Domain model for the insurance claim demo.
 *
 * This package is intentionally free of any Temporal (or NestJS/React) dependency so that the
 * workflow code, the API and the browser all agree on exactly the same shapes.
 */

export type ClaimType = 'auto' | 'home' | 'health' | 'travel';

/** Ordered lifecycle stages of a claim. */
export type StageId =
  | 'submitted'
  | 'initial-validation'
  | 'coverage-verification'
  | 'damage-assessment'
  | 'fraud-evaluation'
  | 'human-review'
  | 'decision'
  | 'payment'
  | 'completed';

export type StageStatus =
  'pending' | 'active' | 'waiting' | 'completed' | 'failed' | 'skipped' | 'cancelled';

/** High level phase of the claim, derived from the stage the workflow is currently in. */
export type ClaimPhase =
  | 'running'
  | 'awaiting-review'
  | 'awaiting-information'
  | 'blocked-on-failure'
  | 'paying'
  | 'completed'
  | 'denied'
  | 'cancelled'
  | 'failed';

export type EventLevel = 'info' | 'success' | 'warning' | 'error';

export interface StageState {
  id: StageId;
  name: string;
  status: StageStatus;
  startedAt?: string;
  completedAt?: string;
  /** Short human readable summary of what happened during the stage. */
  detail?: string;
  /** How many times the workflow re-ran this stage (after a recovery signal). */
  runs: number;
}

export interface TimelineEvent {
  seq: number;
  at: string;
  stage: StageId | 'workflow';
  level: EventLevel;
  message: string;
  data?: Record<string, unknown>;
}

/**
 * Knobs the UI can flip to make the demo misbehave on purpose.
 * The workflow passes this object to activities; activities decide how to fail.
 */
export interface SimulationConfig {
  /** Stage whose activity fails a few times before succeeding (exercises the retry policy). */
  transientFailureStage: StageId | null;
  /** Number of activity attempts that fail before the activity finally succeeds. */
  transientFailureAttempts: number;
  /** Stage whose activity throws a non-retryable failure (exercises workflow failure handling). */
  permanentFailureStage: StageId | null;
  /** Stage that behaves like a slow external service. */
  slowStage: StageId | null;
  /** How slow the "slow external service" is, in milliseconds. */
  slowMs: number;
  /** Force the fraud score (0-100) instead of letting the fraud child workflow compute one. */
  forceFraudScore: number | null;
}

export const DEFAULT_SIMULATION: SimulationConfig = {
  transientFailureStage: null,
  transientFailureAttempts: 2,
  permanentFailureStage: null,
  slowStage: null,
  slowMs: 8000,
  forceFraudScore: null,
};

export interface ClaimInput {
  claimId: string;
  policyNumber: string;
  policyholder: string;
  claimType: ClaimType;
  /** ISO date of the incident. */
  incidentDate: string;
  description: string;
  amount: number;
  /** Contact email used by notification activities. */
  contactEmail?: string;
  /** ISO timestamp produced by the API (never generated inside workflow code). */
  submittedAt: string;
  simulation: SimulationConfig;
  /** Durable timer length (seconds) used as the payment settlement hold. */
  paymentHoldSeconds: number;
  /** How often (seconds) the workflow nudges the adjuster while waiting for review. */
  reviewReminderSeconds: number;
}

export interface ValidationResult {
  valid: boolean;
  issues: string[];
  normalizedAmount: number;
}

export interface CoverageResult {
  covered: boolean;
  policyActive: boolean;
  deductible: number;
  coverageLimit: number;
  reason: string;
}

export interface DamageAssessment {
  estimatedRepairCost: number;
  severity: 'minor' | 'moderate' | 'severe';
  inspector: string;
  notes: string;
}

export type FraudBand = 'low' | 'medium' | 'high';

export interface FraudSignal {
  code: string;
  description: string;
  weight: number;
}

export interface FraudAssessment {
  score: number;
  band: FraudBand;
  signals: FraudSignal[];
  recommendation: 'auto-approve' | 'manual-review' | 'investigate';
}

export interface PaymentResult {
  paymentId: string;
  amount: number;
  method: string;
  paidAt: string;
}

export interface ReserveResult {
  reserveId: string;
  amount: number;
}

export interface ClaimDecision {
  outcome: 'approved' | 'denied';
  approvedAmount?: number;
  reason: string;
  decidedBy: string;
  decidedAt: string;
  /** True when the decision was made by the workflow rather than a human adjuster. */
  automatic: boolean;
}

export interface InformationRequest {
  question: string;
  requestedBy: string;
  requestedAt: string;
  answeredAt?: string;
  answer?: string;
  answeredBy?: string;
}

export interface AdjusterNote {
  at: string;
  author: string;
  note: string;
}

/**
 * What (if anything) the workflow is currently blocked on. The UI uses this to decide which
 * controls to enable.
 */
export type AwaitingInput =
  | { kind: 'none' }
  | { kind: 'human-review'; since: string; remindersSent: number }
  | { kind: 'more-information'; since: string; question: string; requestedBy: string }
  | { kind: 'failure-recovery'; since: string; stage: StageId; error: string; attempts: number };

/** Full workflow state returned by the `getClaimState` query. */
export interface ClaimState {
  claimId: string;
  workflowId: string;
  input: Omit<ClaimInput, 'simulation'>;
  phase: ClaimPhase;
  currentStage: StageId;
  progress: number;
  stages: StageState[];
  timeline: TimelineEvent[];
  awaiting: AwaitingInput;
  simulation: SimulationConfig;
  validation?: ValidationResult;
  coverage?: CoverageResult;
  assessment?: DamageAssessment;
  fraud?: FraudAssessment;
  reserve?: ReserveResult;
  decision?: ClaimDecision;
  payment?: PaymentResult;
  informationRequests: InformationRequest[];
  notes: AdjusterNote[];
  /** Workflow id of the fraud-evaluation child workflow, for deep links into the Temporal UI. */
  fraudChildWorkflowId?: string;
  /** Number of times a stage was recovered via the `recoverStage` signal. */
  recoveryCount: number;
  /** Workflow-time (replay safe) of the most recent state change. */
  updatedAt: string;
}

export interface ClaimResult {
  claimId: string;
  outcome: 'approved' | 'denied' | 'abandoned';
  paidAmount: number;
  paymentId?: string;
  summary: string;
}

/* -------------------------------------------------------------------------- */
/* Signal / update payloads                                                    */
/* -------------------------------------------------------------------------- */

export interface ApprovePayload {
  adjuster: string;
  approvedAmount?: number;
  notes?: string;
}

export interface DenyPayload {
  adjuster: string;
  reason: string;
}

export interface RequestInfoPayload {
  adjuster: string;
  question: string;
}

export interface ProvideInfoPayload {
  answer: string;
  submittedBy: string;
}

export interface RecoverStagePayload {
  /** `retry` re-runs the failed stage, `abandon` fails the workflow on purpose. */
  action: 'retry' | 'abandon';
  /** Clear the failure simulation so the retry can succeed. */
  clearSimulation: boolean;
  requestedBy: string;
}

export interface AddNotePayload {
  author: string;
  note: string;
}

/* -------------------------------------------------------------------------- */
/* API request / response contracts                                            */
/* -------------------------------------------------------------------------- */

export interface CreateClaimRequest {
  policyNumber: string;
  policyholder: string;
  claimType: ClaimType;
  incidentDate: string;
  description: string;
  amount: number;
  contactEmail?: string;
  simulation?: Partial<SimulationConfig>;
  paymentHoldSeconds?: number;
  reviewReminderSeconds?: number;
}

export interface CreateClaimResponse {
  claimId: string;
  workflowId: string;
  runId: string;
}

/** Lightweight row rendered in the claims table; built from Temporal visibility records. */
export interface ClaimSummary {
  claimId: string;
  workflowId: string;
  runId: string;
  workflowStatus: WorkflowStatusName;
  claimStatus?: string;
  claimType?: string;
  policyholder?: string;
  amount?: number;
  fraudScore?: number;
  startedAt?: string;
  closedAt?: string;
}

export type WorkflowStatusName =
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELED'
  | 'TERMINATED'
  | 'CONTINUED_AS_NEW'
  | 'TIMED_OUT'
  | 'UNKNOWN';

/** A retrying / running activity as reported by Temporal's DescribeWorkflowExecution. */
export interface PendingActivityInfo {
  activityId: string;
  activityType: string;
  state: string;
  attempt: number;
  maximumAttempts: number;
  scheduledAt?: string;
  lastStartedAt?: string;
  expirationAt?: string;
  lastFailure?: string;
  heartbeatDetails?: unknown;
}

export interface WorkflowExecutionInfo {
  workflowId: string;
  runId: string;
  workflowType: string;
  taskQueue: string;
  status: WorkflowStatusName;
  startedAt?: string;
  closedAt?: string;
  historyLength: number;
  searchAttributes: Record<string, unknown>;
  memo: Record<string, unknown>;
}

export interface ClaimDetailResponse {
  workflow: WorkflowExecutionInfo;
  /** Result of the `getClaimState` query; null when the workflow is not queryable. */
  state: ClaimState | null;
  /** Populated when the state query failed (e.g. terminated workflow). */
  stateError?: string;
  pendingActivities: PendingActivityInfo[];
  /** Present once the workflow closed successfully. */
  result?: ClaimResult;
  resultError?: string;
}

export interface HistoryEventSummary {
  eventId: number;
  eventTime?: string;
  eventType: string;
  details?: string;
}

export interface ApiConfigResponse {
  taskQueue: string;
  namespace: string;
  temporalAddress: string;
  temporalUiUrl: string;
  workerAdminUrl: string;
}

export interface WorkerHealthResponse {
  status: 'ok' | 'unreachable';
  workerId?: string;
  startedAt?: string;
  restarts?: number;
  taskQueue?: string;
  error?: string;
}
