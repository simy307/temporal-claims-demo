import { log } from '@temporalio/activity';
import {
  POLICY_RULES,
  type ClaimInput,
  type CoverageResult,
  type DamageAssessment,
  type ReserveResult,
  type ValidationResult,
} from '@claims/shared';
import { seededUnit, simulateExternalCall } from './simulation';

/**
 * Structural validation of the submitted claim.
 * Retried automatically by the workflow's retry policy when it fails transiently.
 */
export async function validateClaim(input: ClaimInput): Promise<ValidationResult> {
  await simulateExternalCall('initial-validation', input.simulation, 400);

  const issues: string[] = [];
  if (!input.policyNumber || input.policyNumber.trim().length < 4) {
    issues.push('Policy number is missing or malformed');
  }
  if (!(input.amount > 0)) {
    issues.push('Claim amount must be greater than zero');
  }
  if (!input.description || input.description.trim().length < 10) {
    issues.push('Incident description is too short to process');
  }
  const incident = Date.parse(input.incidentDate);
  if (Number.isNaN(incident)) {
    issues.push('Incident date is not a valid date');
  } else if (incident > Date.parse(input.submittedAt) + 24 * 60 * 60 * 1000) {
    issues.push('Incident date is in the future');
  }

  log.info('Claim validated', { claimId: input.claimId, issues: issues.length });
  return {
    valid: issues.length === 0,
    issues,
    normalizedAmount: Math.round(input.amount * 100) / 100,
  };
}

/** Verifies the policy is active and that the loss is covered. */
export async function verifyCoverage(input: ClaimInput): Promise<CoverageResult> {
  await simulateExternalCall('coverage-verification', input.simulation, 500);

  const coverageLimit = POLICY_RULES.coverageLimitByType[input.claimType];
  const deductible = POLICY_RULES.deductibleByType[input.claimType];
  // Policy numbers ending in "-X" model a lapsed policy so the denial path can be demoed.
  const policyActive = !input.policyNumber.trim().toUpperCase().endsWith('-X');
  const withinLimit = input.amount <= coverageLimit;
  const covered = policyActive && withinLimit;

  const reason = !policyActive
    ? `Policy ${input.policyNumber} was not active on ${input.incidentDate}`
    : !withinLimit
      ? `Claimed amount ${input.amount} exceeds the ${input.claimType} coverage limit of ${coverageLimit}`
      : `Policy active, ${input.claimType} loss covered up to ${coverageLimit} with a ${deductible} deductible`;

  log.info('Coverage verified', { claimId: input.claimId, covered });
  return { covered, policyActive, deductible, coverageLimit, reason };
}

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

/** Books a financial reserve for the claim (compensated on cancellation or denial). */
export async function reserveFunds(claimId: string, amount: number): Promise<ReserveResult> {
  log.info('Reserving funds', { claimId, amount });
  return { reserveId: `RSV-${claimId}`, amount: Math.round(amount * 100) / 100 };
}

/** Compensating action for {@link reserveFunds}. Safe to call more than once. */
export async function releaseReserve(reserveId: string, reason: string): Promise<void> {
  log.info('Releasing reserve', { reserveId, reason });
}

/** Final bookkeeping step of the claim. */
export async function archiveClaim(claimId: string, outcome: string): Promise<string> {
  log.info('Archiving claim', { claimId, outcome });
  return `ARC-${claimId}`;
}
