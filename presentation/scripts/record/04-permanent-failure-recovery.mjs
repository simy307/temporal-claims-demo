// Demo 4/6 — Payment fails permanently (non-retryable). The workflow parks instead of crashing,
// and an operator recovers it with a signal from the dashboard.
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
  policyholder: 'Ade Balogun',
  policyNumber: 'POL-AUTO-9001',
  claimType: 'auto',
  amount: 12750,
  description: 'Hail damage across the roof, hood and windshield of the vehicle.',
  contactEmail: 'ade.balogun@example.com',
  simulation: { permanentFailureStage: 'payment' },
  paymentHoldSeconds: 2,
  reviewReminderSeconds: 600,
});

await waitForClaim(workflowId, (d) => d.state?.phase === 'awaiting-review', { timeoutMs: 60_000 });

await record('04-permanent-failure-recovery', async (page) => {
  await page.goto(`${WEB_BASE}/claims/${workflowId}`, { waitUntil: 'networkidle' });
  await installCursorOverlay(page);
  await setAdjuster(page, 'Jordan Ellis');
  await pause(page, 1200);

  await clickWithEmphasis(page, page.getByRole('button', { name: 'Approve claim' }));
  await pause(page, 500);

  // The settlement timer runs, then the payment activity throws a non-retryable failure and the
  // workflow parks — it does not crash, it waits for an operator decision.
  await waitForClaim(workflowId, (d) => d.state?.phase === 'blocked-on-failure', { timeoutMs: 30_000 });
  await pause(page, 1000);
  await page.reload({ waitUntil: 'networkidle' });
  await installCursorOverlay(page);
  await smoothScrollTo(page, page.getByText('This claim is waiting for you'));
  await pause(page, 3000);

  await clickWithEmphasis(
    page,
    page.getByRole('button', { name: 'Retry stage & clear the simulated fault' }),
  );
  await pause(page, 600);
  await waitForClaim(workflowId, (d) => d.state?.phase === 'completed', { timeoutMs: 20_000 });
  await pause(page, 3000);
});
