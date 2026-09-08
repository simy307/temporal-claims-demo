import { log } from '@temporalio/activity';
import { POLICY_RULES, type ClaimInput, type FraudSignal } from '@claims/shared';
import { seededUnit, simulateExternalCall } from '../simulation';

/** Screens the claim against watchlists and looks at the amount profile. */
export async function checkWatchlists(input: ClaimInput): Promise<FraudSignal[]> {
  await simulateExternalCall('fraud-evaluation', input.simulation, 450);

  const signals: FraudSignal[] = [];
  if (input.amount >= POLICY_RULES.coverageLimitByType[input.claimType] * 0.75) {
    signals.push({
      code: 'NEAR_LIMIT_AMOUNT',
      description: 'Claimed amount is close to the policy coverage limit',
      weight: 30,
    });
  }
  if (seededUnit(`${input.policyholder}:watchlist`) > 0.85) {
    signals.push({
      code: 'WATCHLIST_HIT',
      description: 'Claimant appears on an industry watchlist',
      weight: 40,
    });
  }
  if (/(cash|urgent|immediately|asap)/i.test(input.description)) {
    signals.push({
      code: 'PRESSURE_LANGUAGE',
      description: 'Claim description uses urgency/pressure language',
      weight: 10,
    });
  }
  log.info('Watchlists checked', { claimId: input.claimId, signals: signals.length });
  return signals;
}
