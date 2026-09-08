import { log } from '@temporalio/activity';
import {
  POLICY_RULES,
  type ClaimInput,
  type FraudAssessment,
  type FraudSignal,
} from '@claims/shared';
import { seededUnit, simulateExternalCall } from './simulation';

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

/** Turns the collected signals into a score, a band and a recommendation. */
export async function scoreFraudRisk(
  claimId: string,
  signals: FraudSignal[],
  forceScore: number | null,
): Promise<FraudAssessment> {
  const base = Math.round(seededUnit(`${claimId}:fraud-base`) * 20);
  const computed = signals.reduce((total, signal) => total + signal.weight, base);
  const score = Math.max(0, Math.min(100, forceScore ?? computed));
  const band = score >= POLICY_RULES.highFraudScore ? 'high' : score >= 40 ? 'medium' : 'low';
  const recommendation =
    band === 'high' ? 'investigate' : band === 'medium' ? 'manual-review' : 'auto-approve';

  log.info('Fraud risk scored', { claimId, score, band });
  return { score, band, signals, recommendation };
}
