// Demo 3/6 — Damage assessment fails twice, then succeeds: Temporal's retry policy at work, with
// zero custom retry logic in the activity or workflow code.
import { record, createClaim, waitForClaim, setAdjuster, pause, WEB_BASE } from '../record-helpers.mjs';

const { workflowId } = await createClaim({
  policyholder: 'Ines Kowalski',
  policyNumber: 'POL-TRVL-8890',
  claimType: 'travel',
  amount: 2400,
  description: 'Checked luggage lost on an international connection; contents claimed.',
  contactEmail: 'ines.k@example.com',
  simulation: { transientFailureStage: 'damage-assessment', transientFailureAttempts: 2 },
  reviewReminderSeconds: 600,
});

await record('03-transient-retry', async (page) => {
  await page.goto(`${WEB_BASE}/claims/${workflowId}`, { waitUntil: 'networkidle' });
  await setAdjuster(page, 'Jordan Ellis');
  await pause(page, 1000);

  // Scroll to the activity retry panel and let the attempt counter climb in real time.
  await page.getByText('Activity execution & retries').scrollIntoViewIfNeeded();
  await pause(page, 500);

  await waitForClaim(workflowId, (d) => {
    const pending = d.pendingActivities?.[0];
    return pending && pending.attempt >= 2;
  }, { timeoutMs: 20_000 });
  await pause(page, 2500);

  await waitForClaim(workflowId, (d) =>
    d.state?.stages?.find((s) => s.id === 'damage-assessment')?.status === 'completed',
  { timeoutMs: 20_000 });
  await pause(page, 2500);
});
