// Demo 2/6 — Human-in-the-loop: the workflow waits indefinitely for a signal, then a full
// request-info / provide-info round trip, then approval and payment.
import {
  record,
  createClaim,
  waitForClaim,
  setAdjuster,
  pause,
  installCursorOverlay,
  smoothScrollTo,
  clickWithEmphasis,
  WEB_BASE,
} from '../record-helpers.mjs';

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
  await installCursorOverlay(page);
  await setAdjuster(page, 'Jordan Ellis');
  await pause(page, 1500);

  // 1. Request more information — the workflow is genuinely suspended, not polling in a loop.
  // Smooth-scroll (not an instant jump) so a viewer can follow to the question, then let the
  // pre-filled question sit on screen long enough to actually read before the emphasized click.
  await smoothScrollTo(page, page.getByLabel('Question for the claimant'));
  await pause(page, 2200);
  await clickWithEmphasis(page, page.getByRole('button', { name: 'Request more info' }));
  await waitForClaim(workflowId, (d) => d.state?.phase === 'awaiting-information');
  await pause(page, 1800);

  // 2. Provide the information — type it out at a readable pace (not an instant fill), then
  // pause on the completed sentence before submitting so it can actually be read.
  const answerField = page.getByLabel('Answer');
  await smoothScrollTo(page, answerField);
  await answerField.click();
  await answerField.pressSequentially('Invoice #4471 attached — plumber confirms burst pipe.', {
    delay: 45,
  });
  await pause(page, 2800);
  await clickWithEmphasis(page, page.getByRole('button', { name: 'Provide information' }));
  await waitForClaim(workflowId, (d) => d.state?.phase === 'awaiting-review');
  await pause(page, 2600);

  // 3. Approve — durable settlement timer, then payment. Give the approved-amount field a beat
  // on screen before the emphasized click.
  await smoothScrollTo(page, page.getByLabel(/Approved amount/));
  await pause(page, 1800);
  await clickWithEmphasis(page, page.getByRole('button', { name: 'Approve claim' }));
  await pause(page, 800);
  await waitForClaim(workflowId, (d) => d.state?.phase === 'completed', { timeoutMs: 30_000 });
  await pause(page, 3000);
});
