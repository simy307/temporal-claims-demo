import { activityInfo, log } from '@temporalio/activity';
import type { PaymentResult, SimulationConfig } from '@claims/shared';
import { simulateExternalCall } from './simulation';

export interface PaymentRequest {
  claimId: string;
  amount: number;
  /** Stable key so a retried payment is never double-issued. */
  idempotencyKey: string;
  method: string;
  simulation: SimulationConfig;
}

/**
 * Issues the payment. Retried by the workflow's payment retry policy; the idempotency key makes
 * repeated attempts safe.
 */
export async function processPayment(request: PaymentRequest): Promise<PaymentResult> {
  await simulateExternalCall('payment', request.simulation, 700);
  const { attempt } = activityInfo();

  const result: PaymentResult = {
    paymentId: `PMT-${request.idempotencyKey}`,
    amount: Math.round(request.amount * 100) / 100,
    method: request.method,
    paidAt: new Date().toISOString(),
  };
  log.info('Payment issued', { ...result, attempt });
  return result;
}

/** Compensating action used when a paid claim is cancelled. */
export async function reversePayment(paymentId: string, reason: string): Promise<void> {
  log.warn('Reversing payment', { paymentId, reason });
}
