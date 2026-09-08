import { log } from '@temporalio/activity';
import { type ClaimInput, type ValidationResult } from '@claims/shared';
import { simulateExternalCall } from '../simulation';

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
