/**
 * Integration test.
 *
 * Runs the real workflow *and* the real activity implementations on a real (local) Temporal
 * server: submit a claim, watch it progress through validation, coverage, damage assessment and
 * the fraud child workflow, park in human review, send the approval signal, and verify the claim
 * completes and pays.
 */
import type { TestWorkflowEnvironment } from '@temporalio/testing';
import {
  QUERIES,
  SIGNALS,
  WORKFLOW_TYPES,
  type ClaimResult,
  type ClaimState,
} from '@claims/shared';
import * as activities from '../../src/activities';
import { claimWorkflow } from '../../src/workflows';
import { buildClaimInput, createTestEnvironment, createTestWorker, waitFor } from '../helpers';

jest.setTimeout(240_000);

const TASK_QUEUE = 'claims-integration-queue';

let testEnv: TestWorkflowEnvironment;

beforeAll(async () => {
  testEnv = await createTestEnvironment();
});

afterAll(async () => {
  await testEnv?.teardown();
});

describe('claim lifecycle (real activities)', () => {
  it('runs a claim from submission through human review to a completed payment', async () => {
    const worker = await createTestWorker(
      testEnv,
      TASK_QUEUE,
      activities as unknown as Record<string, (...args: any[]) => any>,
    );

    await worker.runUntil(async () => {
      const input = buildClaimInput({
        claimId: 'CLM-INTEGRATION-1',
        amount: 9_500,
        paymentHoldSeconds: 1,
        // The first two damage-assessment attempts fail: the retry policy must recover on its own.
        simulation: {
          transientFailureStage: 'damage-assessment',
          transientFailureAttempts: 2,
        } as any,
      });

      const handle = await testEnv.client.workflow.start(claimWorkflow, {
        taskQueue: TASK_QUEUE,
        workflowId: `claim-${input.claimId}`,
        args: [input],
        searchAttributes: {
          ClaimStatus: ['running'],
          ClaimType: [input.claimType],
          Policyholder: [input.policyholder],
          ClaimAmount: [input.amount],
        },
        memo: { claimId: input.claimId },
      });

      // 1. The claim advances on its own until it needs a human.
      const waiting = await waitFor(
        () => handle.query<ClaimState>(QUERIES.claimState),
        (state) => state.phase === 'awaiting-review',
        120_000,
      );

      expect(waiting.validation?.valid).toBe(true);
      expect(waiting.coverage?.covered).toBe(true);
      // Damage assessment succeeded despite the two simulated transient failures.
      expect(waiting.assessment?.estimatedRepairCost).toBeGreaterThan(0);
      expect(waiting.fraud?.score).toBeGreaterThanOrEqual(0);
      expect(waiting.reserve?.reserveId).toBe(`RSV-${input.claimId}`);
      expect(waiting.awaiting).toMatchObject({ kind: 'human-review' });
      expect(await handle.query<number>(QUERIES.progress)).toBe(waiting.progress);

      // The fraud evaluation really did run as a child workflow with its own history.
      const childDescription = await testEnv.client.workflow
        .getHandle(`fraud-check-${input.claimId}`)
        .describe();
      expect(childDescription.type).toBe(WORKFLOW_TYPES.fraudCheck);
      expect(childDescription.status.name).toBe('COMPLETED');

      // 2. A human decides.
      await handle.signal(SIGNALS.approve, {
        adjuster: 'Integration Adjuster',
        approvedAmount: 9_000,
        notes: 'Approved by the integration test',
      });

      // 3. The workflow finishes the payment stage and completes.
      const result: ClaimResult = await handle.result();
      expect(result.outcome).toBe('approved');
      expect(result.paidAmount).toBe(9_000);
      expect(result.paymentId).toContain(input.claimId);

      const finalState = await handle.query<ClaimState>(QUERIES.claimState);
      expect(finalState.phase).toBe('completed');
      expect(finalState.progress).toBe(100);
      expect(finalState.decision).toMatchObject({
        outcome: 'approved',
        decidedBy: 'Integration Adjuster',
        automatic: false,
      });
      expect(finalState.payment?.amount).toBe(9_000);

      const description = await handle.describe();
      expect(description.status.name).toBe('COMPLETED');

      // Search attributes are queryable, which is how the dashboard lists claims.
      const found: string[] = [];
      for await (const execution of testEnv.client.workflow.list({
        query: `WorkflowType = '${WORKFLOW_TYPES.claim}' AND ClaimStatus = 'completed'`,
      })) {
        found.push(execution.workflowId);
      }
      expect(found).toContain(`claim-${input.claimId}`);
    });
  });
});
