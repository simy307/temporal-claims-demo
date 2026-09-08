import { ApplicationFailure, Context, activityInfo, heartbeat, log } from '@temporalio/activity';
import { FAILURE_TYPES, type SimulationConfig, type StageId } from '@claims/shared';

/**
 * Deterministic pseudo-random number in [0, 1) derived from a string.
 *
 * Activities are allowed to be nondeterministic, but deriving demo values from the claim id keeps
 * results stable across retries and worker restarts, which makes the demo much easier to follow.
 */
export function seededUnit(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10_000) / 10_000;
}

/** Cancellation-aware sleep that heartbeats so the workflow can cancel a slow activity. */
export async function sleepWithHeartbeat(totalMs: number): Promise<void> {
  const ctx = Context.current();
  const step = 500;
  let elapsed = 0;
  while (elapsed < totalMs) {
    const wait = Math.min(step, totalMs - elapsed);
    await ctx.sleep(wait);
    elapsed += wait;
    heartbeat({ elapsedMs: elapsed, totalMs });
  }
}

/**
 * Simulates a call to an external system.
 *
 * All of the demo's failure modes live here so that the workflow code stays clean:
 *  - permanent failure  -> non-retryable ApplicationFailure (workflow handles it)
 *  - transient failure  -> retryable ApplicationFailure for the first N attempts
 *  - slow service       -> long, heartbeating, cancellable sleep
 */
export async function simulateExternalCall(
  stage: StageId,
  simulation: SimulationConfig,
  baseLatencyMs = 300,
): Promise<void> {
  const { attempt, activityType } = activityInfo();

  if (simulation.permanentFailureStage === stage) {
    log.error('Simulated permanent failure', { stage, activityType, attempt });
    throw ApplicationFailure.create({
      message: `Simulated permanent failure in "${stage}": the downstream system rejected the request`,
      type: FAILURE_TYPES.permanent,
      nonRetryable: true,
      details: [{ stage, attempt }],
    });
  }

  if (
    simulation.transientFailureStage === stage &&
    attempt <= simulation.transientFailureAttempts
  ) {
    log.warn('Simulated transient failure', { stage, activityType, attempt });
    throw ApplicationFailure.create({
      message: `Simulated transient failure in "${stage}" (attempt ${attempt} of ${
        simulation.transientFailureAttempts + 1
      } needed) — Temporal will retry automatically`,
      type: FAILURE_TYPES.transient,
      nonRetryable: false,
      details: [{ stage, attempt }],
    });
  }

  const latency =
    simulation.slowStage === stage ? Math.max(simulation.slowMs, baseLatencyMs) : baseLatencyMs;
  if (latency > baseLatencyMs) {
    log.info('Simulating a slow external service', { stage, latency });
  }
  await sleepWithHeartbeat(latency);
}
