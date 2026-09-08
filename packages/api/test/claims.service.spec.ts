import { NotFoundException } from '@nestjs/common';
import { QUERIES, SIGNALS, UPDATES, WORKFLOW_TYPES } from '@claims/shared';
import { ClaimsService } from '../src/claims/claims.service';
import type { TemporalService } from '../src/temporal/temporal.service';

function createHandleMock(overrides: Record<string, unknown> = {}) {
  return {
    signal: jest.fn(async (..._args: any[]) => undefined),
    query: jest.fn(async () => ({ phase: 'awaiting-review' })),
    executeUpdate: jest.fn(async () => 3),
    cancel: jest.fn(async () => undefined),
    terminate: jest.fn(async () => undefined),
    fetchHistory: jest.fn(async () => ({ events: [] })),
    describe: jest.fn(async () => ({
      workflowId: 'claim-CLM-1',
      runId: 'run-1',
      type: WORKFLOW_TYPES.claim,
      taskQueue: 'claims-task-queue',
      status: { name: 'RUNNING', code: 1 },
      historyLength: 42,
      startTime: new Date('2026-01-01T00:00:00Z'),
      memo: { claimId: 'CLM-1' },
      searchAttributes: { ClaimStatus: ['awaiting-review'] },
      raw: {
        pendingActivities: [
          {
            activityId: '5',
            activityType: { name: 'processPayment' },
            state: 1,
            attempt: 3,
            maximumAttempts: 6,
            scheduledTime: { seconds: 1767225600, nanos: 0 },
            lastFailure: { message: 'Simulated transient failure' },
          },
        ],
      },
    })),
    result: jest.fn(async () => ({ claimId: 'CLM-1', outcome: 'approved' })),
    firstExecutionRunId: 'run-1',
    ...overrides,
  };
}

function createService(handle = createHandleMock()) {
  const start = jest.fn(async (..._args: any[]) => handle);
  const list = jest.fn(function* () {
    yield {
      workflowId: 'claim-CLM-1',
      runId: 'run-1',
      status: { name: 'CANCELLED' },
      memo: { claimId: 'CLM-1', policyholder: 'Dana', claimType: 'auto', amount: 8400 },
      searchAttributes: {
        ClaimStatus: ['cancelled'],
        ClaimType: ['auto'],
        Policyholder: ['Dana'],
        ClaimAmount: [8400],
        FraudScore: [22],
      },
      startTime: new Date('2026-01-01T00:00:00Z'),
    };
  });

  const temporal = {
    client: {
      workflow: {
        start,
        list,
        getHandle: jest.fn(() => handle),
      },
    },
  } as unknown as TemporalService;

  return { service: new ClaimsService(temporal), start, handle };
}

describe('ClaimsService', () => {
  it('starts a workflow with a meaningful id, search attributes and memo', async () => {
    const { service, start } = createService();

    const response = await service.createClaim({
      policyNumber: 'POL-AUTO-1',
      policyholder: 'Dana Whitfield',
      claimType: 'auto',
      incidentDate: '2026-01-01',
      description: 'Rear-ended at a stoplight.',
      amount: 8400,
    });

    expect(response.claimId).toMatch(/^CLM-\d{8}-[A-Z0-9]{6}$/);
    expect(response.workflowId).toBe(`claim-${response.claimId}`);
    expect(response.runId).toBe('run-1');

    const [workflowType, options] = start.mock.calls[0] as [string, any];
    expect(workflowType).toBe(WORKFLOW_TYPES.claim);
    expect(options.workflowId).toBe(response.workflowId);
    expect(options.searchAttributes.ClaimType).toEqual(['auto']);
    expect(options.searchAttributes.ClaimAmount).toEqual([8400]);
    expect(options.memo.claimId).toBe(response.claimId);

    // Nondeterministic values are produced by the API, not by workflow code.
    const input = options.args[0];
    expect(new Date(input.submittedAt).toString()).not.toBe('Invalid Date');
    expect(input.simulation).toMatchObject({ transientFailureStage: null });
    expect(input.paymentHoldSeconds).toBe(10);
  });

  it('maps visibility records (including CANCELLED) into claim summaries', async () => {
    const { service } = createService();
    const [summary] = await service.listClaims(10);

    expect(summary).toMatchObject({
      claimId: 'CLM-1',
      workflowId: 'claim-CLM-1',
      workflowStatus: 'CANCELED',
      claimStatus: 'cancelled',
      claimType: 'auto',
      policyholder: 'Dana',
      amount: 8400,
      fraudScore: 22,
    });
  });

  it('combines the workflow description, the state query and pending activities', async () => {
    const { service, handle } = createService();
    const detail = await service.getClaim('claim-CLM-1');

    expect(handle.query).toHaveBeenCalledWith(QUERIES.claimState);
    expect(detail.workflow).toMatchObject({
      workflowId: 'claim-CLM-1',
      status: 'RUNNING',
      historyLength: 42,
    });
    expect(detail.pendingActivities).toHaveLength(1);
    expect(detail.pendingActivities[0]).toMatchObject({
      activityType: 'processPayment',
      attempt: 3,
      maximumAttempts: 6,
      lastFailure: 'Simulated transient failure',
      state: 'SCHEDULED',
    });
    // The workflow is still running, so no result is fetched.
    expect(detail.result).toBeUndefined();
  });

  it('reports the query error but keeps the workflow description when a query fails', async () => {
    const handle = createHandleMock({
      query: jest.fn(async () => {
        throw new Error('workflow not queryable');
      }),
    });
    const { service } = createService(handle);

    const detail = await service.getClaim('claim-CLM-1');
    expect(detail.state).toBeNull();
    expect(detail.stateError).toContain('not queryable');
    expect(detail.workflow.status).toBe('RUNNING');
  });

  it('sends each human decision as the matching signal', async () => {
    const { service, handle } = createService();

    await service.approve('claim-CLM-1', { adjuster: 'A' });
    await service.deny('claim-CLM-1', { adjuster: 'A', reason: 'no' });
    await service.requestInformation('claim-CLM-1', { adjuster: 'A', question: 'why?' });
    await service.provideInformation('claim-CLM-1', { answer: 'because', submittedBy: 'B' });
    await service.recoverStage('claim-CLM-1', {
      action: 'retry',
      clearSimulation: true,
      requestedBy: 'A',
    });
    await service.updateSimulation('claim-CLM-1', { permanentFailureStage: 'payment' });

    expect(handle.signal.mock.calls.map(([name]) => name)).toEqual([
      SIGNALS.approve,
      SIGNALS.deny,
      SIGNALS.requestInfo,
      SIGNALS.provideInfo,
      SIGNALS.recoverStage,
      SIGNALS.updateSimulation,
    ]);
  });

  it('adds notes through a workflow update', async () => {
    const { service, handle } = createService();
    await expect(service.addNote('claim-CLM-1', { author: 'A', note: 'hi' })).resolves.toEqual({
      noteCount: 3,
    });
    expect(handle.executeUpdate).toHaveBeenCalledWith(UPDATES.addNote, {
      args: [{ author: 'A', note: 'hi' }],
    });
  });

  it('cancels and terminates through the Temporal client', async () => {
    const { service, handle } = createService();
    await service.cancel('claim-CLM-1');
    await service.terminate('claim-CLM-1', 'because');
    expect(handle.cancel).toHaveBeenCalled();
    expect(handle.terminate).toHaveBeenCalledWith('because');
  });

  it('translates unknown workflows into 404s', async () => {
    const handle = createHandleMock({
      describe: jest.fn(async () => {
        const error = new Error('workflow execution not found');
        error.name = 'WorkflowNotFoundError';
        throw error;
      }),
    });
    const { service } = createService(handle);
    await expect(service.getClaim('claim-missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
