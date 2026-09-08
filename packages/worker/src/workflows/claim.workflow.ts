/**
 * The insurance claim workflow.
 *
 * Temporal is the only source of truth for a claim: every stage transition, timeline entry and
 * human decision lives in this workflow's state and is exposed through the `getClaimState` query.
 * There is no database anywhere in this demo.
 *
 * Temporal features demonstrated here:
 *  - activities with per-stage retry policies and non-retryable error types
 *  - a child workflow for the fraud evaluation
 *  - durable timers (settlement hold + adjuster reminder loop)
 *  - signals for every human interaction, with an indefinite wait for the adjuster
 *  - queries for state and progress, plus an update (with validator) for adjuster notes
 *  - cancellation handling with compensating activities in a non-cancellable scope
 *  - activity/workflow failure handling with a UI-driven "retry or abandon" recovery loop
 *  - search attributes so claims can be found in the Temporal Web UI
 */
import {
  ActivityFailure,
  ApplicationFailure,
  CancellationScope,
  ChildWorkflowFailure,
  allHandlersFinished,
  condition,
  executeChild,
  isCancellation,
  log,
  proxyActivities,
  setHandler,
  sleep,
  upsertSearchAttributes,
  workflowInfo,
} from '@temporalio/workflow';
import {
  FAILURE_TYPES,
  POLICY_RULES,
  SEARCH_ATTRIBUTES,
  computeProgress,
  createInitialStages,
  fraudWorkflowIdForClaim,
  type ClaimDecision,
  type ClaimInput,
  type ClaimPhase,
  type ClaimResult,
  type ClaimState,
  type EventLevel,
  type InformationRequest,
  type ProvideInfoPayload,
  type RecoverStagePayload,
  type StageId,
} from '@claims/shared';
import type * as activities from '../activities';
import {
  addNoteUpdate,
  approveSignal,
  claimStateQuery,
  denySignal,
  progressQuery,
  provideInfoSignal,
  recoverStageSignal,
  requestInfoSignal,
  updateSimulationSignal,
} from './definitions';
import { fraudCheckWorkflow } from './fraud-check.workflow';

/** Fast, frequently retried business activities. */
const { validateClaim, verifyCoverage, reserveFunds, releaseReserve, archiveClaim } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: '30 seconds',
    retry: {
      initialInterval: '1 second',
      backoffCoefficient: 2,
      maximumInterval: '10 seconds',
      maximumAttempts: 5,
      nonRetryableErrorTypes: [FAILURE_TYPES.permanent],
    },
  });

/** Long running external estimator: heartbeats, so it can also be cancelled. */
const { assessDamage } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  heartbeatTimeout: '15 seconds',
  retry: {
    initialInterval: '2 seconds',
    backoffCoefficient: 2,
    maximumInterval: '20 seconds',
    maximumAttempts: 4,
    nonRetryableErrorTypes: [FAILURE_TYPES.permanent],
  },
});

/** Money movement: more attempts, longer backoff. */
const { processPayment, reversePayment } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
  retry: {
    initialInterval: '2 seconds',
    backoffCoefficient: 2,
    maximumInterval: '30 seconds',
    maximumAttempts: 6,
    nonRetryableErrorTypes: [FAILURE_TYPES.permanent],
  },
});

/** Notifications are best-effort. */
const { notifyClaimant, notifyAdjuster } = proxyActivities<typeof activities>({
  startToCloseTimeout: '20 seconds',
  retry: { initialInterval: '1 second', maximumAttempts: 3 },
});

interface Inbox {
  decision: ClaimDecision | null;
  infoRequest: InformationRequest | null;
  infoAnswer: ProvideInfoPayload | null;
  recovery: RecoverStagePayload | null;
}

/** Digs the most useful message out of an activity/child-workflow failure chain. */
function failureMessage(error: unknown): string {
  if (error instanceof ActivityFailure || error instanceof ChildWorkflowFailure) {
    return failureMessage(error.cause ?? error);
  }
  if (error instanceof ApplicationFailure) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function claimWorkflow(input: ClaimInput): Promise<ClaimResult> {
  const info = workflowInfo();
  const { simulation, ...claimDetails } = input;

  const state: ClaimState = {
    claimId: input.claimId,
    workflowId: info.workflowId,
    input: claimDetails,
    phase: 'running',
    currentStage: 'submitted',
    progress: 0,
    stages: createInitialStages(),
    timeline: [],
    awaiting: { kind: 'none' },
    simulation: { ...simulation },
    informationRequests: [],
    notes: [],
    recoveryCount: 0,
    updatedAt: new Date(Date.now()).toISOString(),
  };

  const inbox: Inbox = { decision: null, infoRequest: null, infoAnswer: null, recovery: null };

  /* ------------------------------------------------------------------ */
  /* State helpers — `Date.now()` is deterministic inside a workflow.     */
  /* ------------------------------------------------------------------ */
  let seq = 0;
  const nowIso = () => new Date(Date.now()).toISOString();
  const stageOf = (id: StageId) => {
    const found = state.stages.find((stage) => stage.id === id);
    if (!found) {
      throw ApplicationFailure.create({ message: `Unknown stage ${id}`, nonRetryable: true });
    }
    return found;
  };
  const touch = () => {
    state.progress = computeProgress(state.stages);
    state.updatedAt = nowIso();
  };
  const addEvent = (
    stage: StageId | 'workflow',
    level: EventLevel,
    message: string,
    data?: Record<string, unknown>,
  ) => {
    seq += 1;
    state.timeline.push({ seq, at: nowIso(), stage, level, message, data });
    if (state.timeline.length > 300) {
      state.timeline.shift();
    }
    touch();
  };
  const setPhase = (phase: ClaimPhase) => {
    state.phase = phase;
    upsertSearchAttributes({ [SEARCH_ATTRIBUTES.claimStatus]: [phase] });
    touch();
  };
  const beginStage = (id: StageId, detail: string) => {
    const stage = stageOf(id);
    state.currentStage = id;
    stage.status = 'active';
    stage.runs += 1;
    stage.startedAt = nowIso();
    stage.completedAt = undefined;
    stage.detail = detail;
    addEvent(id, 'info', `${stage.name} started`);
  };
  const completeStage = (id: StageId, detail: string) => {
    const stage = stageOf(id);
    stage.status = 'completed';
    stage.completedAt = nowIso();
    stage.detail = detail;
    addEvent(id, 'success', detail);
  };
  const skipStage = (id: StageId, detail: string) => {
    const stage = stageOf(id);
    stage.status = 'skipped';
    stage.completedAt = nowIso();
    stage.detail = detail;
    addEvent(id, 'info', `${stage.name} skipped — ${detail}`);
  };

  /* ------------------------------------------------------------------ */
  /* Signal, query and update handlers                                   */
  /* ------------------------------------------------------------------ */
  setHandler(approveSignal, (payload) => {
    if (state.phase !== 'awaiting-review' && state.phase !== 'awaiting-information') {
      addEvent(
        'human-review',
        'warning',
        `Approval from ${payload.adjuster} ignored — the claim is not awaiting review`,
      );
      return;
    }
    const approvedAmount =
      payload.approvedAmount ?? state.assessment?.estimatedRepairCost ?? input.amount;
    inbox.decision = {
      outcome: 'approved',
      approvedAmount,
      reason: payload.notes?.trim() || 'Approved by adjuster',
      decidedBy: payload.adjuster,
      decidedAt: nowIso(),
      automatic: false,
    };
    addEvent('human-review', 'success', `${payload.adjuster} approved the claim`, {
      approvedAmount,
    });
  });

  setHandler(denySignal, (payload) => {
    if (state.phase !== 'awaiting-review' && state.phase !== 'awaiting-information') {
      addEvent(
        'human-review',
        'warning',
        `Denial from ${payload.adjuster} ignored — the claim is not awaiting review`,
      );
      return;
    }
    inbox.decision = {
      outcome: 'denied',
      reason: payload.reason,
      decidedBy: payload.adjuster,
      decidedAt: nowIso(),
      automatic: false,
    };
    addEvent('human-review', 'warning', `${payload.adjuster} denied the claim`, {
      reason: payload.reason,
    });
  });

  setHandler(requestInfoSignal, (payload) => {
    if (state.phase !== 'awaiting-review') {
      addEvent(
        'human-review',
        'warning',
        'Information request ignored — the claim is not awaiting review',
      );
      return;
    }
    const request: InformationRequest = {
      question: payload.question,
      requestedBy: payload.adjuster,
      requestedAt: nowIso(),
    };
    inbox.infoRequest = request;
    state.informationRequests.push(request);
    addEvent('human-review', 'warning', `${payload.adjuster} requested more information`, {
      question: payload.question,
    });
  });

  setHandler(provideInfoSignal, (payload) => {
    if (state.phase !== 'awaiting-information') {
      addEvent('human-review', 'warning', 'Information ignored — none was requested');
      return;
    }
    inbox.infoAnswer = payload;
  });

  setHandler(recoverStageSignal, (payload) => {
    if (state.phase !== 'blocked-on-failure') {
      addEvent('workflow', 'warning', 'Recovery signal ignored — the claim is not blocked');
      return;
    }
    inbox.recovery = payload;
  });

  setHandler(updateSimulationSignal, (patch) => {
    state.simulation = { ...state.simulation, ...patch };
    addEvent('workflow', 'info', 'Failure simulation settings updated', { ...patch });
  });

  setHandler(claimStateQuery, () => state);
  setHandler(progressQuery, () => state.progress);
  setHandler(
    addNoteUpdate,
    (payload) => {
      state.notes.push({ at: nowIso(), author: payload.author, note: payload.note.trim() });
      addEvent('workflow', 'info', `Note added by ${payload.author}`);
      return state.notes.length;
    },
    {
      validator: (payload) => {
        if (!payload.note || payload.note.trim().length === 0) {
          throw new Error('Note must not be empty');
        }
        if (payload.note.length > 500) {
          throw new Error('Note must be 500 characters or fewer');
        }
      },
    },
  );

  /** Activity input always carries the *current* simulation settings. */
  const activityInput = (): ClaimInput => ({ ...claimDetails, simulation: state.simulation });

  /**
   * Runs one stage. On failure the workflow does not die: it parks in `blocked-on-failure` and
   * waits (forever) for the UI to send a `recoverStage` signal asking to retry or abandon.
   */
  const runStage = async <T>(id: StageId, detail: string, work: () => Promise<T>): Promise<T> => {
    for (;;) {
      beginStage(id, detail);
      try {
        return await work();
      } catch (error) {
        if (isCancellation(error)) {
          throw error;
        }
        const message = failureMessage(error);
        const stage = stageOf(id);
        stage.status = 'failed';
        stage.detail = message;
        addEvent(id, 'error', `${stage.name} failed — ${message}`);
        setPhase('blocked-on-failure');
        state.awaiting = {
          kind: 'failure-recovery',
          since: nowIso(),
          stage: id,
          error: message,
          attempts: stage.runs,
        };
        touch();
        log.warn('Stage failed; waiting for an operator recovery signal', { stage: id, message });
        await notifyAdjuster(state.claimId, `Claim ${state.claimId} is blocked at "${id}"`);

        await condition(() => inbox.recovery !== null);
        const recovery = inbox.recovery as RecoverStagePayload;
        inbox.recovery = null;
        state.awaiting = { kind: 'none' };
        state.recoveryCount += 1;

        if (recovery.action === 'abandon') {
          addEvent(id, 'error', `${recovery.requestedBy} abandoned the claim at ${stage.name}`);
          throw ApplicationFailure.create({
            message: `Claim abandoned while recovering "${stage.name}": ${message}`,
            type: FAILURE_TYPES.claimAbandoned,
            nonRetryable: true,
          });
        }

        if (recovery.clearSimulation) {
          state.simulation = {
            ...state.simulation,
            permanentFailureStage: null,
            transientFailureStage: null,
            slowStage: null,
          };
          addEvent(id, 'info', 'Failure simulation cleared before retrying');
        }
        setPhase('running');
        addEvent(id, 'info', `${recovery.requestedBy} requested a retry of ${stage.name}`);
      }
    }
  };

  /** Human adjuster review: waits indefinitely, nudging the adjuster on a durable timer. */
  const runHumanReview = async (): Promise<ClaimDecision> => {
    const stage = stageOf('human-review');
    state.currentStage = 'human-review';
    stage.status = 'waiting';
    stage.runs += 1;
    stage.startedAt = nowIso();
    stage.detail = 'Waiting for an adjuster decision';
    setPhase('awaiting-review');
    const waitingSince = nowIso();
    let reminders = 0;
    state.awaiting = { kind: 'human-review', since: waitingSince, remindersSent: reminders };
    addEvent(
      'human-review',
      'warning',
      'Waiting for an adjuster to approve, deny or ask for more information',
    );
    await notifyAdjuster(state.claimId, `Claim ${state.claimId} is ready for review`);

    for (;;) {
      const settled = await condition(
        () => inbox.decision !== null || inbox.infoRequest !== null,
        `${input.reviewReminderSeconds} seconds`,
      );

      if (!settled) {
        // Durable timer fired: nobody has acted yet, so nudge and keep waiting (forever).
        reminders += 1;
        state.awaiting = { kind: 'human-review', since: waitingSince, remindersSent: reminders };
        addEvent('human-review', 'warning', `Reminder #${reminders} sent to the adjuster queue`);
        await notifyAdjuster(
          state.claimId,
          `Reminder ${reminders}: claim ${state.claimId} still needs a decision`,
        );
        continue;
      }

      const decision = inbox.decision;
      if (decision) {
        stage.status = 'completed';
        stage.completedAt = nowIso();
        stage.detail = `${decision.outcome} by ${decision.decidedBy}`;
        state.awaiting = { kind: 'none' };
        touch();
        return decision;
      }

      const request = inbox.infoRequest;
      if (request) {
        inbox.infoRequest = null;
        setPhase('awaiting-information');
        state.awaiting = {
          kind: 'more-information',
          since: nowIso(),
          question: request.question,
          requestedBy: request.requestedBy,
        };
        await notifyClaimant({
          claimId: state.claimId,
          email: input.contactEmail,
          subject: `More information needed for claim ${state.claimId}`,
          body: request.question,
        });

        // Wait indefinitely for the claimant's answer (or a decision made in the meantime).
        await condition(() => inbox.infoAnswer !== null || inbox.decision !== null);
        const answer = inbox.infoAnswer;
        if (answer) {
          inbox.infoAnswer = null;
          request.answer = answer.answer;
          request.answeredBy = answer.submittedBy;
          request.answeredAt = nowIso();
          addEvent('human-review', 'success', `Information provided by ${answer.submittedBy}`, {
            answer: answer.answer,
          });
        }
        if (inbox.decision === null) {
          setPhase('awaiting-review');
          state.awaiting = { kind: 'human-review', since: waitingSince, remindersSent: reminders };
          await notifyAdjuster(
            state.claimId,
            `Claim ${state.claimId} has the requested information and is ready for review`,
          );
        }
      }
    }
  };

  try {
    /* ---------------- 1. Claim submitted ---------------- */
    beginStage('submitted', 'Recording the claim');
    upsertSearchAttributes({
      [SEARCH_ATTRIBUTES.claimStatus]: ['running'],
      [SEARCH_ATTRIBUTES.claimType]: [input.claimType],
      [SEARCH_ATTRIBUTES.policyholder]: [input.policyholder],
      [SEARCH_ATTRIBUTES.claimAmount]: [input.amount],
    });
    await notifyClaimant({
      claimId: state.claimId,
      email: input.contactEmail,
      subject: `We received your claim ${state.claimId}`,
      body: `Your ${input.claimType} claim for ${input.amount} is being processed.`,
    });
    completeStage('submitted', `Claim ${state.claimId} recorded for policy ${input.policyNumber}`);

    /* ---------------- 2. Initial validation ---------------- */
    const validation = await runStage('initial-validation', 'Validating the submission', () =>
      validateClaim(activityInput()),
    );
    state.validation = validation;
    let autoDenialReason: string | null = null;
    if (validation.valid) {
      completeStage('initial-validation', 'Submission passed validation');
    } else {
      autoDenialReason = `Validation failed: ${validation.issues.join('; ')}`;
      completeStage('initial-validation', autoDenialReason);
    }

    /* ---------------- 3. Policy coverage verification ---------------- */
    if (autoDenialReason) {
      skipStage('coverage-verification', 'the claim already failed validation');
    } else {
      const coverage = await runStage(
        'coverage-verification',
        'Checking the policy covers this loss',
        () => verifyCoverage(activityInput()),
      );
      state.coverage = coverage;
      completeStage('coverage-verification', coverage.reason);
      if (!coverage.covered) {
        autoDenialReason = coverage.reason;
      } else {
        state.reserve = await reserveFunds(state.claimId, input.amount);
        addEvent('coverage-verification', 'info', `Reserve ${state.reserve.reserveId} booked`, {
          amount: state.reserve.amount,
        });
      }
    }

    /* ---------------- 4. Damage assessment ---------------- */
    if (autoDenialReason) {
      skipStage('damage-assessment', 'the claim is heading for an automatic denial');
    } else {
      const assessment = await runStage(
        'damage-assessment',
        'Calling the external damage estimator',
        () => assessDamage(activityInput()),
      );
      state.assessment = assessment;
      completeStage(
        'damage-assessment',
        `${assessment.severity} damage estimated at ${assessment.estimatedRepairCost} by ${assessment.inspector}`,
      );
    }

    /* ---------------- 5. Fraud-risk evaluation (child workflow) ---------------- */
    if (autoDenialReason) {
      skipStage('fraud-evaluation', 'the claim is heading for an automatic denial');
    } else {
      const fraud = await runStage('fraud-evaluation', 'Running the fraud child workflow', () => {
        const attempt = stageOf('fraud-evaluation').runs;
        const childWorkflowId =
          attempt <= 1
            ? fraudWorkflowIdForClaim(state.claimId)
            : `${fraudWorkflowIdForClaim(state.claimId)}-retry-${attempt}`;
        state.fraudChildWorkflowId = childWorkflowId;
        return executeChild(fraudCheckWorkflow, {
          args: [activityInput()],
          workflowId: childWorkflowId,
          taskQueue: info.taskQueue,
        });
      });
      state.fraud = fraud;
      upsertSearchAttributes({ [SEARCH_ATTRIBUTES.fraudScore]: [fraud.score] });
      completeStage(
        'fraud-evaluation',
        `Fraud score ${fraud.score}/100 (${fraud.band} risk) — recommendation: ${fraud.recommendation}`,
      );
      if (fraud.score >= POLICY_RULES.highFraudScore) {
        addEvent('fraud-evaluation', 'warning', 'High fraud risk — flagged for investigation');
      }
    }

    /* ---------------- 6. Human adjuster review ---------------- */
    let decision: ClaimDecision;
    if (autoDenialReason) {
      skipStage('human-review', 'automatic denial does not need an adjuster');
      decision = {
        outcome: 'denied',
        reason: autoDenialReason,
        decidedBy: 'system',
        decidedAt: nowIso(),
        automatic: true,
      };
    } else {
      decision = await runHumanReview();
    }

    /* ---------------- 7. Claim approved or denied ---------------- */
    beginStage('decision', 'Recording the decision');
    state.decision = decision;
    if (decision.outcome === 'denied') {
      setPhase('denied');
      if (state.reserve) {
        await releaseReserve(state.reserve.reserveId, `claim denied: ${decision.reason}`);
        addEvent('decision', 'info', `Reserve ${state.reserve.reserveId} released`);
      }
      completeStage('decision', `Claim denied by ${decision.decidedBy}: ${decision.reason}`);
      skipStage('payment', 'the claim was denied');
    } else {
      completeStage(
        'decision',
        `Claim approved by ${decision.decidedBy} for ${decision.approvedAmount}`,
      );
    }

    /* ---------------- 8. Payment processing ---------------- */
    if (decision.outcome === 'approved') {
      setPhase('paying');
      let holdCompleted = false;
      const payment = await runStage('payment', 'Settlement hold, then payment', async () => {
        if (!holdCompleted) {
          addEvent(
            'payment',
            'info',
            `Durable settlement hold of ${input.paymentHoldSeconds}s started (survives worker restarts)`,
          );
          await sleep(`${input.paymentHoldSeconds} seconds`);
          holdCompleted = true;
          addEvent('payment', 'info', 'Settlement hold elapsed');
        }
        return processPayment({
          claimId: state.claimId,
          amount: decision.approvedAmount ?? input.amount,
          idempotencyKey: `${state.claimId}-${info.runId.slice(0, 8)}`,
          method: 'ACH',
          simulation: state.simulation,
        });
      });
      state.payment = payment;
      completeStage('payment', `Payment ${payment.paymentId} of ${payment.amount} issued`);
    }

    /* ---------------- 9. Claim completed ---------------- */
    beginStage('completed', 'Archiving and notifying the claimant');
    const archiveId = await archiveClaim(state.claimId, decision.outcome);
    await notifyClaimant({
      claimId: state.claimId,
      email: input.contactEmail,
      subject: `Your claim ${state.claimId} was ${decision.outcome}`,
      body:
        decision.outcome === 'approved'
          ? `We paid ${state.payment?.amount ?? 0} via ${state.payment?.method ?? 'ACH'}.`
          : `Reason: ${decision.reason}`,
    });
    completeStage('completed', `Claim archived as ${archiveId}`);
    setPhase(decision.outcome === 'approved' ? 'completed' : 'denied');

    const result: ClaimResult = {
      claimId: state.claimId,
      outcome: decision.outcome,
      paidAmount: state.payment?.amount ?? 0,
      paymentId: state.payment?.paymentId,
      summary:
        decision.outcome === 'approved'
          ? `Approved by ${decision.decidedBy} and paid ${state.payment?.amount ?? 0}`
          : `Denied by ${decision.decidedBy}: ${decision.reason}`,
    };
    addEvent('workflow', 'success', `Claim ${decision.outcome}`, { ...result });

    // Let any in-flight update/signal handler finish before the workflow closes.
    await condition(allHandlersFinished);
    return result;
  } catch (error) {
    if (isCancellation(error)) {
      // Cancellation: compensate in a non-cancellable scope so the cleanup actually runs.
      await CancellationScope.nonCancellable(async () => {
        const current = stageOf(state.currentStage);
        if (current.status === 'active' || current.status === 'waiting') {
          current.status = 'cancelled';
          current.completedAt = nowIso();
        }
        setPhase('cancelled');
        addEvent('workflow', 'warning', 'Cancellation requested — running compensations');
        if (state.payment) {
          await reversePayment(state.payment.paymentId, 'claim cancelled');
          addEvent('workflow', 'warning', `Payment ${state.payment.paymentId} reversed`);
        }
        if (state.reserve) {
          await releaseReserve(state.reserve.reserveId, 'claim cancelled');
          addEvent('workflow', 'warning', `Reserve ${state.reserve.reserveId} released`);
        }
        await notifyClaimant({
          claimId: state.claimId,
          email: input.contactEmail,
          subject: `Claim ${state.claimId} was cancelled`,
          body: 'Your claim was cancelled before it completed.',
        });
        state.awaiting = { kind: 'none' };
        addEvent('workflow', 'warning', 'Compensations complete — workflow ends as CANCELLED');
      });
      throw error;
    }

    const message = failureMessage(error);
    setPhase('failed');
    state.awaiting = { kind: 'none' };
    addEvent('workflow', 'error', `Claim workflow failed — ${message}`);
    log.error('Claim workflow failed', { claimId: state.claimId, message });
    throw error;
  }
}
