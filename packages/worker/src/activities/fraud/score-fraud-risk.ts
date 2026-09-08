import { log } from '@temporalio/activity';
import { POLICY_RULES, type FraudAssessment, type FraudSignal } from '@claims/shared';
import { seededUnit } from '../simulation';

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
