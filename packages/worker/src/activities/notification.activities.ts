import { log } from '@temporalio/activity';

export interface ClaimantNotification {
  claimId: string;
  email?: string;
  subject: string;
  body: string;
}

/** Pretends to email the claimant. In a real system this would call an email provider. */
export async function notifyClaimant(notification: ClaimantNotification): Promise<void> {
  log.info('Notifying claimant', {
    claimId: notification.claimId,
    to: notification.email ?? 'unknown@example.com',
    subject: notification.subject,
  });
}

/** Pretends to page the adjuster queue (used by the review reminder timer). */
export async function notifyAdjuster(claimId: string, message: string): Promise<void> {
  log.info('Notifying adjuster queue', { claimId, message });
}
