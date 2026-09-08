import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { WorkflowHandle } from '@temporalio/client';
import type { Duration } from '@temporalio/common';
import {
  DEFAULT_SIMULATION,
  QUERIES,
  SEARCH_ATTRIBUTES,
  SIGNALS,
  UPDATES,
  WORKFLOW_TYPES,
  workflowIdForClaim,
  type AddNotePayload,
  type ApprovePayload,
  type ClaimDetailResponse,
  type ClaimInput,
  type ClaimResult,
  type ClaimState,
  type ClaimSummary,
  type CreateClaimRequest,
  type CreateClaimResponse,
  type DenyPayload,
  type HistoryEventSummary,
  type ProvideInfoPayload,
  type RecoverStagePayload,
  type RequestInfoPayload,
  type SimulationConfig,
} from '@claims/shared';
import { apiConfig } from '../config';
import { TemporalService } from '../temporal/temporal.service';
import {
  readSearchAttribute,
  toHistorySummary,
  toIso,
  toNumber,
  toPendingActivities,
  toStatusName,
  toWorkflowExecutionInfo,
} from './temporal.mappers';

const CLAIM_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class ClaimsService {
  private readonly logger = new Logger(ClaimsService.name);

  constructor(private readonly temporal: TemporalService) {}

  /* ---------------------------------------------------------------- */
  /* Commands                                                          */
  /* ---------------------------------------------------------------- */

  /** Starts a claim workflow. All nondeterministic values are generated here, not in the workflow. */
  async createClaim(request: CreateClaimRequest): Promise<CreateClaimResponse> {
    const claimId = this.generateClaimId();
    const workflowId = workflowIdForClaim(claimId);
    const simulation: SimulationConfig = { ...DEFAULT_SIMULATION, ...(request.simulation ?? {}) };

    const input: ClaimInput = {
      claimId,
      policyNumber: request.policyNumber.trim(),
      policyholder: request.policyholder.trim(),
      claimType: request.claimType,
      incidentDate: request.incidentDate,
      description: request.description.trim(),
      amount: request.amount,
      contactEmail: request.contactEmail,
      submittedAt: new Date().toISOString(),
      simulation,
      paymentHoldSeconds: request.paymentHoldSeconds ?? 10,
      reviewReminderSeconds: request.reviewReminderSeconds ?? 60,
    };

    const handle = await this.run(() =>
      this.temporal.client.workflow.start(WORKFLOW_TYPES.claim, {
        taskQueue: apiConfig.taskQueue,
        workflowId,
        args: [input],
        workflowExecutionTimeout: apiConfig.workflowExecutionTimeout as Duration,
        // Meaningful ids + search attributes make claims easy to find in the Temporal Web UI.
        searchAttributes: {
          [SEARCH_ATTRIBUTES.claimStatus]: ['running'],
          [SEARCH_ATTRIBUTES.claimType]: [input.claimType],
          [SEARCH_ATTRIBUTES.policyholder]: [input.policyholder],
          [SEARCH_ATTRIBUTES.claimAmount]: [input.amount],
        },
        memo: {
          claimId,
          policyholder: input.policyholder,
          claimType: input.claimType,
          amount: input.amount,
          submittedAt: input.submittedAt,
        },
      }),
    );

    this.logger.log(`Started claim workflow ${workflowId} (run ${handle.firstExecutionRunId})`);
    return { claimId, workflowId, runId: handle.firstExecutionRunId };
  }

  approve(workflowId: string, payload: ApprovePayload): Promise<void> {
    return this.signal(workflowId, SIGNALS.approve, payload);
  }

  deny(workflowId: string, payload: DenyPayload): Promise<void> {
    return this.signal(workflowId, SIGNALS.deny, payload);
  }

  requestInformation(workflowId: string, payload: RequestInfoPayload): Promise<void> {
    return this.signal(workflowId, SIGNALS.requestInfo, payload);
  }

  provideInformation(workflowId: string, payload: ProvideInfoPayload): Promise<void> {
    return this.signal(workflowId, SIGNALS.provideInfo, payload);
  }

  recoverStage(workflowId: string, payload: RecoverStagePayload): Promise<void> {
    return this.signal(workflowId, SIGNALS.recoverStage, payload);
  }

  updateSimulation(workflowId: string, patch: Partial<SimulationConfig>): Promise<void> {
    return this.signal(workflowId, SIGNALS.updateSimulation, patch);
  }

  /** Adds an adjuster note using a Temporal *update* (synchronous and validated). */
  async addNote(workflowId: string, payload: AddNotePayload): Promise<{ noteCount: number }> {
    const noteCount = await this.run(() =>
      this.handle(workflowId).executeUpdate<number, [AddNotePayload]>(UPDATES.addNote, {
        args: [payload],
      }),
    );
    return { noteCount };
  }

  async cancel(workflowId: string): Promise<void> {
    await this.run(() => this.handle(workflowId).cancel());
  }

  async terminate(workflowId: string, reason?: string): Promise<void> {
    await this.run(() => this.handle(workflowId).terminate(reason ?? 'terminated from dashboard'));
  }

  /* ---------------------------------------------------------------- */
  /* Queries                                                           */
  /* ---------------------------------------------------------------- */

  /** Lists claims straight out of Temporal's visibility store — no local registry. */
  async listClaims(limit = 50, query?: string): Promise<ClaimSummary[]> {
    const listQuery =
      query && query.trim().length > 0 ? query.trim() : `WorkflowType = '${WORKFLOW_TYPES.claim}'`;

    const summaries: ClaimSummary[] = [];
    await this.run(async () => {
      for await (const execution of this.temporal.client.workflow.list({
        query: listQuery,
        pageSize: Math.min(limit, 100),
      })) {
        summaries.push(this.toSummary(execution));
        if (summaries.length >= limit) {
          break;
        }
      }
    });

    return summaries.sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
  }

  /**
   * Authoritative view of a single claim: workflow description (status, retries) plus the
   * `getClaimState` query result. Nothing is cached.
   */
  async getClaim(workflowId: string): Promise<ClaimDetailResponse> {
    const handle = this.handle(workflowId);
    const description = await this.run(() => handle.describe());
    const workflow = toWorkflowExecutionInfo(description);

    let state: ClaimState | null = null;
    let stateError: string | undefined;
    try {
      state = await handle.query<ClaimState>(QUERIES.claimState);
    } catch (error) {
      stateError = error instanceof Error ? error.message : String(error);
    }

    let result: ClaimResult | undefined;
    let resultError: string | undefined;
    if (workflow.status !== 'RUNNING') {
      try {
        result = (await handle.result()) as ClaimResult;
      } catch (error) {
        resultError = error instanceof Error ? error.message : String(error);
      }
    }

    return {
      workflow,
      state,
      stateError,
      pendingActivities: toPendingActivities((description as any).raw?.pendingActivities),
      result,
      resultError,
    };
  }

  async getHistory(workflowId: string, limit = 200): Promise<HistoryEventSummary[]> {
    const history = await this.run(() => this.handle(workflowId).fetchHistory());
    const events = toHistorySummary((history as any).events);
    return events.slice(-limit);
  }

  async getProgress(workflowId: string): Promise<{ progress: number }> {
    const progress = await this.run(() => this.handle(workflowId).query<number>(QUERIES.progress));
    return { progress };
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  private handle(workflowId: string): WorkflowHandle {
    if (!workflowId || workflowId.length > 200) {
      throw new BadRequestException('Invalid workflow id');
    }
    return this.temporal.client.workflow.getHandle(workflowId);
  }

  private async signal(workflowId: string, name: string, payload: unknown): Promise<void> {
    await this.run(() => this.handle(workflowId).signal(name, payload));
  }

  private toSummary(execution: any): ClaimSummary {
    const memo = (execution.memo ?? {}) as Record<string, unknown>;
    const workflowId: string = execution.workflowId;
    return {
      claimId: (memo.claimId as string) ?? workflowId.replace(/^claim-/, ''),
      workflowId,
      runId: execution.runId,
      workflowStatus: toStatusName(execution.status),
      claimStatus: readSearchAttribute(execution, SEARCH_ATTRIBUTES.claimStatus) as
        string | undefined,
      claimType:
        (readSearchAttribute(execution, SEARCH_ATTRIBUTES.claimType) as string | undefined) ??
        (memo.claimType as string | undefined),
      policyholder:
        (readSearchAttribute(execution, SEARCH_ATTRIBUTES.policyholder) as string | undefined) ??
        (memo.policyholder as string | undefined),
      amount:
        toNumber(readSearchAttribute(execution, SEARCH_ATTRIBUTES.claimAmount), NaN) ||
        (memo.amount as number | undefined),
      fraudScore: (() => {
        const raw = readSearchAttribute(execution, SEARCH_ATTRIBUTES.fraudScore);
        return raw === undefined || raw === null ? undefined : toNumber(raw);
      })(),
      startedAt: toIso(execution.startTime),
      closedAt: toIso(execution.closeTime),
    };
  }

  /** Translates Temporal client errors into meaningful HTTP errors. */
  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const name = (error as { name?: string })?.name ?? '';
      if (name === 'WorkflowNotFoundError' || /not found|NOT_FOUND/i.test(message)) {
        throw new NotFoundException(`Workflow not found: ${message}`);
      }
      if (/already started|ALREADY_EXISTS/i.test(message)) {
        throw new BadRequestException(message);
      }
      if (/UNAVAILABLE|ECONNREFUSED|Connection refused/i.test(message)) {
        throw new ServiceUnavailableException(`Temporal is unavailable: ${message}`);
      }
      if (/INVALID_ARGUMENT|is not a valid|workflow execution already completed/i.test(message)) {
        throw new BadRequestException(message);
      }
      throw error;
    }
  }

  /** Human friendly, sortable, unique claim id (e.g. `CLM-20260908-K7F2QX`). */
  private generateClaimId(): string {
    const now = new Date();
    const date = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(
      now.getUTCDate(),
    ).padStart(2, '0')}`;
    let suffix = '';
    for (let i = 0; i < 6; i += 1) {
      suffix += CLAIM_ID_ALPHABET[Math.floor(Math.random() * CLAIM_ID_ALPHABET.length)];
    }
    return `CLM-${date}-${suffix}`;
  }
}
