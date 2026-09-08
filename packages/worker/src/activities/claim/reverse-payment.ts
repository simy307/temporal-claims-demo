import { log } from '@temporalio/activity';

/** Compensating action used when a paid claim is cancelled. */
export async function reversePayment(paymentId: string, reason: string): Promise<void> {
  log.warn('Reversing payment', { paymentId, reason });
}
