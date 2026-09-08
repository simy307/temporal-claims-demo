import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { SearchAttributeType, defineSearchAttributeKey } from '@temporalio/common';
import {
  DEFAULT_SIMULATION,
  SEARCH_ATTRIBUTE_TYPES,
  type ClaimInput,
  type ClaimType,
  type SimulationConfig,
} from '@claims/shared';
import type * as activities from '../src/activities';

/**
 * A local Temporal dev server (rather than the time-skipping test server): the workflow upserts
 * custom search attributes, which the time-skipping server does not support.
 */
export function createTestEnvironment(): Promise<TestWorkflowEnvironment> {
  return TestWorkflowEnvironment.createLocal({
    server: {
      searchAttributes: Object.entries(SEARCH_ATTRIBUTE_TYPES).map(([name, type]) =>
        defineSearchAttributeKey(
          name,
          type === 'Keyword' ? SearchAttributeType.KEYWORD : SearchAttributeType.DOUBLE,
        ),
      ),
    },
  });
}

export function createTestWorker(
  testEnv: TestWorkflowEnvironment,
  taskQueue: string,
  activityImplementations: Record<string, (...args: any[]) => any>,
): Promise<Worker> {
  return Worker.create({
    connection: testEnv.nativeConnection,
    taskQueue,
    workflowsPath: require.resolve('../src/workflows'),
    activities: activityImplementations,
  });
}

export function buildClaimInput(overrides: Partial<ClaimInput> = {}): ClaimInput {
  const simulation: SimulationConfig = {
    ...DEFAULT_SIMULATION,
    ...(overrides.simulation ?? {}),
  };
  return {
    claimId: 'CLM-TEST-0001',
    policyNumber: 'POL-AUTO-1234',
    policyholder: 'Test Claimant',
    claimType: 'auto' as ClaimType,
    incidentDate: '2024-01-05',
    description: 'Side mirror and door panel damaged in a parking lot.',
    amount: 4200,
    contactEmail: 'claimant@example.com',
    submittedAt: '2024-01-06T10:00:00.000Z',
    // Keep timers short: this environment runs in real time.
    paymentHoldSeconds: 1,
    reviewReminderSeconds: 3_600,
    ...overrides,
    simulation,
  };
}

/**
 * Fast, deterministic stand-ins for every activity. Individual tests override just the ones they
 * care about, which keeps the workflow unit tests focused on orchestration logic.
 */
export function mockActivities(
  overrides: Partial<Record<keyof typeof activities, (...args: any[]) => any>> = {},
): Record<string, (...args: any[]) => any> {
  const defaults = {
    validateClaim: async () => ({ valid: true, issues: [], normalizedAmount: 4200 }),
    verifyCoverage: async () => ({
      covered: true,
      policyActive: true,
      deductible: 500,
      coverageLimit: 50_000,
      reason: 'Policy active and loss covered',
    }),
    assessDamage: async () => ({
      estimatedRepairCost: 4500,
      severity: 'moderate' as const,
      inspector: 'Test Inspector',
      notes: 'test assessment',
    }),
    reserveFunds: async (claimId: string, amount: number) => ({
      reserveId: `RSV-${claimId}`,
      amount,
    }),
    releaseReserve: async () => undefined,
    archiveClaim: async (claimId: string) => `ARC-${claimId}`,
    checkClaimHistory: async () => [],
    checkWatchlists: async () => [],
    scoreFraudRisk: async () => ({
      score: 12,
      band: 'low' as const,
      signals: [],
      recommendation: 'auto-approve' as const,
    }),
    processPayment: async (request: {
      amount: number;
      idempotencyKey: string;
      method: string;
    }) => ({
      paymentId: `PMT-${request.idempotencyKey}`,
      amount: request.amount,
      method: request.method,
      paidAt: '2024-01-06T10:05:00.000Z',
    }),
    reversePayment: async () => undefined,
    notifyClaimant: async () => undefined,
    notifyAdjuster: async () => undefined,
  };
  return { ...defaults, ...overrides } as Record<string, (...args: any[]) => any>;
}

/** Polls a query until the predicate is satisfied (or the timeout elapses). */
export async function waitFor<T>(
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 30_000,
  intervalMs = 100,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T | undefined;
  while (Date.now() < deadline) {
    last = await read();
    if (predicate(last)) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for condition. Last value: ${JSON.stringify(last)}`);
}
