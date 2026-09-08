import type { StageId } from './types';

/** Task queue shared by the worker and the API's Temporal client. */
export const TASK_QUEUE = 'claims-task-queue';

/** Workflow type names (kept as constants so the API never imports workflow code). */
export const WORKFLOW_TYPES = {
  claim: 'claimWorkflow',
  fraudCheck: 'fraudCheckWorkflow',
} as const;

/** Signal names. Signals are the only way the UI mutates a running workflow. */
export const SIGNALS = {
  approve: 'approveClaim',
  deny: 'denyClaim',
  requestInfo: 'requestMoreInformation',
  provideInfo: 'provideInformation',
  recoverStage: 'recoverStage',
  updateSimulation: 'updateSimulation',
} as const;

/** Query names. Queries are the only way the UI reads workflow state. */
export const QUERIES = {
  claimState: 'getClaimState',
  progress: 'getProgress',
  fraudProgress: 'getFraudProgress',
} as const;

/** Update names (synchronous, validated request/response into the workflow). */
export const UPDATES = {
  addNote: 'addAdjusterNote',
} as const;

/** Custom search attributes registered on the local dev server. */
export const SEARCH_ATTRIBUTES = {
  claimStatus: 'ClaimStatus',
  claimType: 'ClaimType',
  policyholder: 'Policyholder',
  claimAmount: 'ClaimAmount',
  fraudScore: 'FraudScore',
} as const;

export const SEARCH_ATTRIBUTE_TYPES: Record<string, 'Keyword' | 'Double'> = {
  [SEARCH_ATTRIBUTES.claimStatus]: 'Keyword',
  [SEARCH_ATTRIBUTES.claimType]: 'Keyword',
  [SEARCH_ATTRIBUTES.policyholder]: 'Keyword',
  [SEARCH_ATTRIBUTES.claimAmount]: 'Double',
  [SEARCH_ATTRIBUTES.fraudScore]: 'Double',
};

/**
 * Failure types raised by activities. The workflow's retry policies reference them by name, which
 * is what makes "transient" failures retry and "permanent" failures stop immediately.
 */
export const FAILURE_TYPES = {
  permanent: 'PermanentSystemFailure',
  transient: 'TransientSystemFailure',
  claimAbandoned: 'ClaimAbandoned',
} as const;

/** Business rules used by activities (kept here so the UI can explain the outcome). */
export const POLICY_RULES = {
  autoApproveUnder: 0,
  coverageLimitByType: {
    auto: 50_000,
    home: 250_000,
    health: 100_000,
    travel: 15_000,
  },
  deductibleByType: {
    auto: 500,
    home: 1_000,
    health: 250,
    travel: 100,
  },
  highFraudScore: 75,
} as const;

/** Prefix used to build meaningful, human readable workflow ids. */
export const CLAIM_WORKFLOW_ID_PREFIX = 'claim';

export function workflowIdForClaim(claimId: string): string {
  return `${CLAIM_WORKFLOW_ID_PREFIX}-${claimId}`;
}

export function fraudWorkflowIdForClaim(claimId: string): string {
  return `fraud-check-${claimId}`;
}

/** Stages whose activities can be made to fail from the UI. */
export const SIMULATABLE_STAGES: StageId[] = [
  'initial-validation',
  'coverage-verification',
  'damage-assessment',
  'fraud-evaluation',
  'payment',
];
