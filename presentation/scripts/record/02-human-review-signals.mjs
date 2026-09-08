// Demo 2/6 — Human-in-the-loop: the workflow waits indefinitely for a signal, then a full
// request-info / provide-info round trip, then approval and payment.
import { record, createClaim, waitForClaim, setAdjuster, pause, WEB_BASE } from '../record-helpers.mjs';

const { workflowId } = await createClaim({
  policyholder: 'Marcus Feld',
  policyNumber: 'POL-HOME-2210',
  claimType: 'home',
  amount: 32500,
  description: 'Burst pipe flooded the basement and damaged flooring and drywall.',
  contactEmail: 'marcus.feld@example.com',
  paymentHoldSeconds: 3,
  reviewReminderSeconds: 600,
});

await waitForClaim(workflowId, (d) => d.state?.phase === 'awaiting-review', { timeoutMs: 60_000 });

await record('02-human-review-signals', async (page) => {
  await page.goto(`${WEB_BASE}/claims/${workflowId}`, { waitUntil: 'networkidle' });
  await setAdjuster(page, 'Jordan Ellis');
  await pause(page, 1500);

  // 1. Request more information — the workflow is genuinely suspended, not polling in a loop.
  await page.getByRole('button', { name: 'Request more info' }).click();
  await pause(page, 500);
  await waitForClaim(workflowId, (d) => d.state?.phase === 'awaiting-information');
  await pause(page, 1800);

  // 2. Provide the information — claim returns to human review.
  await page.getByLabel('Answer').fill('Invoice #4471 attached — plumber confirms burst pipe.');
  await page.getByRole('button', { name: 'Provide information' }).click();
  await pause(page, 500);
  await waitForClaim(workflowId, (d) => d.state?.phase === 'awaiting-review');
  await pause(page, 1500);

  // 3. Approve — durable settlement timer, then payment.
  await page.getByRole('button', { name: 'Approve claim' }).click();
  await pause(page, 800);
  await waitForClaim(workflowId, (d) => d.state?.phase === 'completed', { timeoutMs: 30_000 });
  await pause(page, 3000);
});
