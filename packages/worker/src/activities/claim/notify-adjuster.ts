import { log } from '@temporalio/activity';

/** Pretends to page the adjuster queue (used by the review reminder timer). */
export async function notifyAdjuster(claimId: string, message: string): Promise<void> {
  log.info('Notifying adjuster queue', { claimId, message });
}
