import { log } from '@temporalio/activity';
import { type ClaimInput, type FraudSignal } from '@claims/shared';
import { seededUnit, simulateExternalCall } from '../simulation';

/** Looks for suspicious patterns in the claimant's history. */
export async function checkClaimHistory(input: ClaimInput): Promise<FraudSignal[]> {
  await simulateExternalCall('fraud-evaluation', input.simulation, 600);

  const signals: FraudSignal[] = [];
  const priorClaims = Math.floor(seededUnit(`${input.claimId}:history`) * 5);
  if (priorClaims >= 3) {
    signals.push({
      code: 'FREQUENT_CLAIMANT',
      description: `${priorClaims} claims filed in the last 24 months`,
      weight: 25,
    });
  }
  const daysSinceIncident =
    (Date.parse(input.submittedAt) - Date.parse(input.incidentDate)) / (24 * 60 * 60 * 1000);
  if (daysSinceIncident > 45) {
    signals.push({
      code: 'LATE_REPORTING',
      description: `Incident reported ${Math.round(daysSinceIncident)} days after it happened`,
      weight: 15,
    });
  }
  log.info('Claim history checked', { claimId: input.claimId, signals: signals.length });
  return signals;
}
