import { log } from '@temporalio/activity';

/** Compensating action for {@link reserveFunds}. Safe to call more than once. */
export async function releaseReserve(reserveId: string, reason: string): Promise<void> {
  log.info('Releasing reserve', { reserveId, reason });
}
