import { log } from '@temporalio/activity';
import { type ReserveResult } from '@claims/shared';

/** Books a financial reserve for the claim (compensated on cancellation or denial). */
export async function reserveFunds(claimId: string, amount: number): Promise<ReserveResult> {
  log.info('Reserving funds', { claimId, amount });
  return { reserveId: `RSV-${claimId}`, amount: Math.round(amount * 100) / 100 };
}
