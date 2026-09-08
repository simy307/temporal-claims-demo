import { log } from '@temporalio/activity';
import { type ClaimInput, type DamageAssessment } from '@claims/shared';
import { seededUnit, simulateExternalCall } from '../simulation';

/**
 * Calls the (simulated) damage estimator. This is the activity used for the
 * "slow external service" demo: it heartbeats so it can be cancelled mid-flight.
 */
export async function assessDamage(input: ClaimInput): Promise<DamageAssessment> {
  await simulateExternalCall('damage-assessment', input.simulation, 1_200);

  const variance = 0.8 + seededUnit(`${input.claimId}:damage`) * 0.5;
  const estimatedRepairCost = Math.round(input.amount * variance * 100) / 100;
  const severity =
    estimatedRepairCost > 25_000 ? 'severe' : estimatedRepairCost > 5_000 ? 'moderate' : 'minor';
  const inspectors = ['R. Alvarez', 'M. Chen', 'P. Novak', 'T. Ibrahim'];
  const inspector = inspectors[Math.floor(seededUnit(`${input.claimId}:inspector`) * 4)];

  log.info('Damage assessed', { claimId: input.claimId, estimatedRepairCost, severity });
  return {
    estimatedRepairCost,
    severity,
    inspector,
    notes: `${severity} ${input.claimType} damage; estimator variance ${(variance * 100).toFixed(0)}% of the claimed amount`,
  };
}
