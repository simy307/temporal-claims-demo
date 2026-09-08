/**
 * Workflow unit tests.
 *
 * Each test runs the real workflow code against a local Temporal server with mocked activities, so
 * the orchestration logic (branching, signals, updates, failure recovery, cancellation) is
 * exercised end to end without touching any external system.
 */
import type { TestWorkflowEnvironment } from '@temporalio/testing';
import { WorkflowFailedError, type WorkflowHandle } from '@temporalio/client';
import { QUERIES, SIGNALS, UPDATES, type ClaimResult, type ClaimState } from '@claims/shared';
import { claimWorkflow } from '../../src/workflows';
import {
  buildClaimInput,
  createTestEnvironment,
  createTestWorker,
  mockActivities,
  waitFor,
} from '../helpers';

jest.setTimeout(180_000);

let testEnv: TestWorkflowEnvironment;

beforeAll(async () => {
  testEnv = await createTestEnvironment();
});

afterAll(async () => {
  await testEnv?.teardown();
});

const readState = (handle: WorkflowHandle) => handle.query<ClaimState>(QUERIES.claimState);

describe('claimWorkflow', () => {
  it('pauses for human review, then approves and pays the claim', async () => {
    const processPayment = jest.fn(async (request: any) => ({
      paymentId: `PMT-${request.idempotencyKey}`,
      amount: request.amount,
      method: request.method,
      paidAt: '2024-01-06T10:05:00.000Z',
    }));
    const worker = await createTestWorker(
      testEnv,
      'approve-queue',
      mockActivities({ processPayment }),
    );

    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(claimWorkflow, {
        taskQueue: 'approve-queue',
        workflowId: 'test-approve',
        args: [buildClaimInput()],
      });

      const waiting = await waitFor(
        () => readState(handle),
        (state) => state.phase === 'awaiting-review',
      );
      expect(waiting.awaiting.kind).toBe('human-review');
      expect(waiting.stages.find((stage) => stage.id === 'human-review')?.status).toBe('waiting');
      expect(waiting.progress).toBeGreaterThan(0);
      expect(waiting.progress).toBeLessThan(100);
      expect(waiting.fraud?.band).toBe('low');
      expect(waiting.fraudChildWorkflowId).toBe('fraud-check-CLM-TEST-0001');

      // A note is delivered as a workflow update and returns the new note count.
      await expect(
        handle.executeUpdate(UPDATES.addNote, {
          args: [{ author: 'A. Adjuster', note: 'Estimate looks reasonable' }],
        }),
      ).resolves.toBe(1);

      await handle.signal(SIGNALS.approve, {
        adjuster: 'A. Adjuster',
        approvedAmount: 4500,
        notes: 'Approved in unit test',
      });

      const result: ClaimResult = await handle.result();
      expect(result.outcome).toBe('approved');
      expect(result.paidAmount).toBe(4500);
      expect(processPayment).toHaveBeenCalledTimes(1);

      const finalState = await readState(handle);
      expect(finalState.phase).toBe('completed');
      expect(finalState.progress).toBe(100);
      expect(finalState.notes).toHaveLength(1);
      expect(finalState.stages.every((stage) => stage.status === 'completed')).toBe(true);
    });
  });

  it('denies the claim when the adjuster denies it and never pays', async () => {
    const processPayment = jest.fn();
    const releaseReserve = jest.fn(async () => undefined);
    const worker = await createTestWorker(
      testEnv,
      'deny-queue',
      mockActivities({ processPayment, releaseReserve }),
    );

    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(claimWorkflow, {
        taskQueue: 'deny-queue',
        workflowId: 'test-deny',
        args: [buildClaimInput()],
      });

      await waitFor(
        () => readState(handle),
        (state) => state.phase === 'awaiting-review',
      );
      await handle.signal(SIGNALS.deny, {
        adjuster: 'A. Adjuster',
        reason: 'Damage predates the policy',
      });

      const result: ClaimResult = await handle.result();
      expect(result.outcome).toBe('denied');
      expect(result.paidAmount).toBe(0);
      expect(processPayment).not.toHaveBeenCalled();
      // The reserve booked earlier must be released when a claim is denied.
      expect(releaseReserve).toHaveBeenCalled();

      const state = await readState(handle);
      expect(state.phase).toBe('denied');
      expect(state.stages.find((stage) => stage.id === 'payment')?.status).toBe('skipped');
    });
  });

  it('round-trips a request for more information before the decision', async () => {
    const worker = await createTestWorker(testEnv, 'info-queue', mockActivities());

    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(claimWorkflow, {
        taskQueue: 'info-queue',
        workflowId: 'test-more-info',
        args: [buildClaimInput()],
      });

      await waitFor(
        () => readState(handle),
        (state) => state.phase === 'awaiting-review',
      );
      await handle.signal(SIGNALS.requestInfo, {
        adjuster: 'A. Adjuster',
        question: 'Please send the repair invoice',
      });

      const awaitingInfo = await waitFor(
        () => readState(handle),
        (state) => state.phase === 'awaiting-information',
      );
      expect(awaitingInfo.awaiting).toMatchObject({
        kind: 'more-information',
        question: 'Please send the repair invoice',
      });

      await handle.signal(SIGNALS.provideInfo, {
        answer: 'Invoice #55 attached',
        submittedBy: 'Test Claimant',
      });

      const backToReview = await waitFor(
        () => readState(handle),
        (state) => state.phase === 'awaiting-review',
      );
      expect(backToReview.informationRequests[0].answer).toBe('Invoice #55 attached');

      await handle.signal(SIGNALS.approve, { adjuster: 'A. Adjuster' });
      const result: ClaimResult = await handle.result();
      expect(result.outcome).toBe('approved');
    });
  });

  it('denies automatically (no human review) when the policy does not cover the loss', async () => {
    const worker = await createTestWorker(
      testEnv,
      'auto-deny-queue',
      mockActivities({
        verifyCoverage: async () => ({
          covered: false,
          policyActive: false,
          deductible: 500,
          coverageLimit: 50_000,
          reason: 'Policy lapsed before the incident',
        }),
      }),
    );

    await worker.runUntil(async () => {
      const result: ClaimResult = await testEnv.client.workflow.execute(claimWorkflow, {
        taskQueue: 'auto-deny-queue',
        workflowId: 'test-auto-deny',
        args: [buildClaimInput()],
      });

      expect(result.outcome).toBe('denied');
      expect(result.summary).toContain('Policy lapsed');

      const state = await testEnv.client.workflow
        .getHandle('test-auto-deny')
        .query<ClaimState>(QUERIES.claimState);
      expect(state.decision?.automatic).toBe(true);
      expect(state.stages.find((stage) => stage.id === 'human-review')?.status).toBe('skipped');
      expect(state.stages.find((stage) => stage.id === 'damage-assessment')?.status).toBe(
        'skipped',
      );
    });
  });

  it('parks on a permanent activity failure and resumes after a recovery signal', async () => {
    let failNext = true;
    const assessDamage = jest.fn(async () => {
      if (failNext) {
        throw new Error('Simulated permanent failure in "damage-assessment"');
      }
      return {
        estimatedRepairCost: 4500,
        severity: 'moderate' as const,
        inspector: 'Test Inspector',
        notes: 'recovered',
      };
    });
    const worker = await createTestWorker(
      testEnv,
      'recovery-queue',
      mockActivities({ assessDamage }),
    );

    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(claimWorkflow, {
        taskQueue: 'recovery-queue',
        workflowId: 'test-recovery',
        args: [buildClaimInput()],
      });

      const blocked = await waitFor(
        () => readState(handle),
        (state) => state.phase === 'blocked-on-failure',
        90_000,
      );
      expect(blocked.awaiting).toMatchObject({
        kind: 'failure-recovery',
        stage: 'damage-assessment',
      });
      expect(blocked.stages.find((stage) => stage.id === 'damage-assessment')?.status).toBe(
        'failed',
      );

      failNext = false;
      await handle.signal(SIGNALS.recoverStage, {
        action: 'retry',
        clearSimulation: true,
        requestedBy: 'A. Adjuster',
      });

      const recovered = await waitFor(
        () => readState(handle),
        (state) => state.phase === 'awaiting-review',
      );
      expect(recovered.recoveryCount).toBe(1);
      expect(recovered.stages.find((stage) => stage.id === 'damage-assessment')?.runs).toBe(2);

      await handle.signal(SIGNALS.approve, { adjuster: 'A. Adjuster' });
      await expect(handle.result()).resolves.toMatchObject({ outcome: 'approved' });
    });
  });

  it('fails the workflow when the operator abandons a blocked claim', async () => {
    const worker = await createTestWorker(
      testEnv,
      'abandon-queue',
      mockActivities({
        validateClaim: async () => {
          throw new Error('validation service exploded');
        },
      }),
    );

    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(claimWorkflow, {
        taskQueue: 'abandon-queue',
        workflowId: 'test-abandon',
        args: [buildClaimInput()],
      });

      await waitFor(
        () => readState(handle),
        (state) => state.phase === 'blocked-on-failure',
        90_000,
      );
      await handle.signal(SIGNALS.recoverStage, {
        action: 'abandon',
        clearSimulation: false,
        requestedBy: 'A. Adjuster',
      });

      await expect(handle.result()).rejects.toBeInstanceOf(WorkflowFailedError);
    });
  });

  it('runs compensating activities when the claim is cancelled', async () => {
    const releaseReserve = jest.fn(async () => undefined);
    const notifyClaimant = jest.fn(async () => undefined);
    const worker = await createTestWorker(
      testEnv,
      'cancel-queue',
      mockActivities({ releaseReserve, notifyClaimant }),
    );

    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(claimWorkflow, {
        taskQueue: 'cancel-queue',
        workflowId: 'test-cancel',
        args: [buildClaimInput()],
      });

      await waitFor(
        () => readState(handle),
        (state) => state.phase === 'awaiting-review',
      );
      await handle.cancel();

      await expect(handle.result()).rejects.toBeTruthy();
      expect(releaseReserve).toHaveBeenCalledWith('RSV-CLM-TEST-0001', 'claim cancelled');
      expect(notifyClaimant).toHaveBeenCalled();

      const state = await readState(handle);
      expect(state.phase).toBe('cancelled');
      expect(state.stages.find((stage) => stage.id === 'human-review')?.status).toBe('cancelled');
    });
  });

  it('ignores signals that do not apply to the current phase', async () => {
    const worker = await createTestWorker(testEnv, 'stray-queue', mockActivities());

    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(claimWorkflow, {
        taskQueue: 'stray-queue',
        workflowId: 'test-stray-signal',
        args: [buildClaimInput()],
      });

      await waitFor(
        () => readState(handle),
        (state) => state.phase === 'awaiting-review',
      );
      // Nothing is blocked, so a recovery signal must be ignored rather than corrupt state.
      await handle.signal(SIGNALS.recoverStage, {
        action: 'abandon',
        clearSimulation: false,
        requestedBy: 'stray',
      });

      const state = await waitFor(
        () => readState(handle),
        (value) =>
          value.timeline.some((event) => event.message.includes('Recovery signal ignored')),
      );
      expect(state.phase).toBe('awaiting-review');

      await handle.signal(SIGNALS.approve, { adjuster: 'A. Adjuster' });
      await expect(handle.result()).resolves.toMatchObject({ outcome: 'approved' });
    });
  });

  it('rejects invalid adjuster notes through the update validator', async () => {
    const worker = await createTestWorker(testEnv, 'note-queue', mockActivities());

    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(claimWorkflow, {
        taskQueue: 'note-queue',
        workflowId: 'test-note-validation',
        args: [buildClaimInput()],
      });

      await waitFor(
        () => readState(handle),
        (state) => state.phase === 'awaiting-review',
      );
      const rejection = await handle
        .executeUpdate(UPDATES.addNote, { args: [{ author: 'A. Adjuster', note: '  ' }] })
        .then(() => null)
        .catch((error: unknown) => error as Error & { cause?: Error });
      expect(rejection).toBeTruthy();
      expect(`${rejection?.message} ${rejection?.cause?.message ?? ''}`).toMatch(
        /Note must not be empty/,
      );

      const state = await readState(handle);
      expect(state.notes).toHaveLength(0);

      await handle.signal(SIGNALS.deny, { adjuster: 'A. Adjuster', reason: 'cleanup' });
      await handle.result();
    });
  });
});
