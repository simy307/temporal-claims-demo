/**
 * Child workflow that performs the fraud-risk evaluation.
 *
 * Running this as a child workflow (instead of a plain activity) gives the stage its own workflow
 * id, its own event history and its own queryable progress in the Temporal Web UI.
 */
import { proxyActivities, setHandler } from '@temporalio/workflow';
import { FAILURE_TYPES, type ClaimInput, type FraudAssessment } from '@claims/shared';
import type * as activities from '../activities';
import { fraudProgressQuery } from './definitions';

const { checkClaimHistory, checkWatchlists, scoreFraudRisk } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
  heartbeatTimeout: '15 seconds',
  retry: {
    initialInterval: '1s',
    backoffCoefficient: 2,
    maximumInterval: '10s',
    maximumAttempts: 4,
    nonRetryableErrorTypes: [FAILURE_TYPES.permanent],
  },
});

export async function fraudCheckWorkflow(input: ClaimInput): Promise<FraudAssessment> {
  let progress = 'starting';
  setHandler(fraudProgressQuery, () => progress);

  progress = 'running risk checks in parallel';
  // Two independent checks run concurrently; Temporal tracks both activities in one history.
  const [historySignals, watchlistSignals] = await Promise.all([
    checkClaimHistory(input),
    checkWatchlists(input),
  ]);

  progress = 'scoring';
  const assessment = await scoreFraudRisk(
    input.claimId,
    [...historySignals, ...watchlistSignals],
    input.simulation.forceFraudScore,
  );

  progress = `complete (${assessment.band} risk, score ${assessment.score})`;
  return assessment;
}
