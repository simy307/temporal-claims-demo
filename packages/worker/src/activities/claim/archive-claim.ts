import { log } from '@temporalio/activity';

/** Final bookkeeping step of the claim. */
export async function archiveClaim(claimId: string, outcome: string): Promise<string> {
  log.info('Archiving claim', { claimId, outcome });
  return `ARC-${claimId}`;
}
