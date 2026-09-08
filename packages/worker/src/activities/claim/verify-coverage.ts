import { log } from '@temporalio/activity';
import { POLICY_RULES, type ClaimInput, type CoverageResult } from '@claims/shared';
import { simulateExternalCall } from '../simulation';

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
