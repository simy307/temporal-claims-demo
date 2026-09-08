import type { ClaimPhase, StageId, StageState, StageStatus } from './types';

export interface StageDefinition {
  id: StageId;
  name: string;
  description: string;
  /** Relative weight used to compute the percentage progress. */
  weight: number;
}

/**
 * The canonical claim lifecycle. Shared by the workflow (which owns the state) and the UI
 * (which renders the timeline), so the two can never drift apart.
 */
export const STAGE_DEFINITIONS: StageDefinition[] = [
  {
    id: 'submitted',
    name: 'Claim submitted',
    description: 'Claim received from the customer portal and durably recorded by Temporal.',
    weight: 1,
  },
  {
    id: 'initial-validation',
    name: 'Initial validation',
    description: 'Structural validation of the claim payload (activity with a retry policy).',
    weight: 1,
  },
  {
    id: 'coverage-verification',
    name: 'Policy coverage verification',
    description: 'Confirms the policy is active and the loss type is covered.',
    weight: 1,
  },
  {
    id: 'damage-assessment',
    name: 'Damage assessment',
    description: 'Calls a (simulated) slow external estimator that heartbeats while it works.',
    weight: 2,
  },
  {
    id: 'fraud-evaluation',
    name: 'Fraud-risk evaluation',
    description: 'Child workflow that runs several risk checks in parallel and scores the claim.',
    weight: 2,
  },
  {
    id: 'human-review',
    name: 'Human adjuster review',
    description: 'Workflow pauses indefinitely until an adjuster signals a decision.',
    weight: 2,
  },
  {
    id: 'decision',
    name: 'Claim approved or denied',
    description: 'Decision is recorded, reserves are released when the claim is denied.',
    weight: 1,
  },
  {
    id: 'payment',
    name: 'Payment processing',
    description: 'Durable settlement timer followed by an idempotent payment activity.',
    weight: 2,
  },
  {
    id: 'completed',
    name: 'Claim completed',
    description: 'Claim archived and the claimant notified.',
    weight: 1,
  },
];

export const STAGE_IDS: StageId[] = STAGE_DEFINITIONS.map((s) => s.id);

export function stageDefinition(id: StageId): StageDefinition {
  const found = STAGE_DEFINITIONS.find((s) => s.id === id);
  if (!found) {
    throw new Error(`Unknown stage: ${id}`);
  }
  return found;
}

export function stageIndex(id: StageId): number {
  return STAGE_IDS.indexOf(id);
}

export function createInitialStages(): StageState[] {
  return STAGE_DEFINITIONS.map((definition) => ({
    id: definition.id,
    name: definition.name,
    status: 'pending' as StageStatus,
    runs: 0,
  }));
}

const TERMINAL_STATUSES: StageStatus[] = ['completed', 'skipped'];

/**
 * Percentage progress of a claim.
 *
 * Completed and skipped stages count fully, the stage in flight counts half, so a claim parked
 * in human review reports meaningful progress instead of jumping from 0 to 100.
 */
export function computeProgress(stages: StageState[]): number {
  const total = stages.reduce((sum, stage) => sum + stageDefinition(stage.id).weight, 0);
  if (total === 0) {
    return 0;
  }
  const earned = stages.reduce((sum, stage) => {
    const weight = stageDefinition(stage.id).weight;
    if (TERMINAL_STATUSES.includes(stage.status)) {
      return sum + weight;
    }
    if (stage.status === 'active' || stage.status === 'waiting') {
      return sum + weight / 2;
    }
    return sum;
  }, 0);
  return Math.min(100, Math.round((earned / total) * 100));
}

const PHASE_LABELS: Record<ClaimPhase, string> = {
  running: 'In progress',
  'awaiting-review': 'Waiting for adjuster',
  'awaiting-information': 'Waiting for information',
  'blocked-on-failure': 'Blocked on failure',
  paying: 'Paying',
  completed: 'Completed',
  denied: 'Denied',
  cancelled: 'Cancelled',
  failed: 'Failed',
};

export function phaseLabel(phase: ClaimPhase): string {
  return PHASE_LABELS[phase] ?? phase;
}

/** Phases in which the workflow is blocked waiting for a human to send a signal. */
export function isWaitingOnHuman(phase: ClaimPhase): boolean {
  return (
    phase === 'awaiting-review' ||
    phase === 'awaiting-information' ||
    phase === 'blocked-on-failure'
  );
}
