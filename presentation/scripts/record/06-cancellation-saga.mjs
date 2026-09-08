// Demo 6/6 — Cancel a claim mid-flight; compensating activities run in a non-cancellable scope
// before the workflow reports CANCELED.
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
  policyholder: 'Victor Reyes',
  policyNumber: 'POL-AUTO-3312',
  claimType: 'auto',
  amount: 41000,
  description: 'Vehicle stolen from a parking garage; needs settlement urgently.',
  contactEmail: 'victor.reyes@example.com',
  reviewReminderSeconds: 600,
});

await waitForClaim(workflowId, (d) => d.state?.phase === 'awaiting-review', { timeoutMs: 60_000 });

await record('06-cancellation-saga', async (page) => {
  await page.goto(`${WEB_BASE}/claims/${workflowId}`, { waitUntil: 'networkidle' });
  await installCursorOverlay(page);
  await setAdjuster(page, 'Jordan Ellis');
  await pause(page, 1500);

  await clickWithEmphasis(page, page.getByRole('button', { name: 'Cancel claim' }));
  await pause(page, 800);

  await waitForClaim(workflowId, (d) => d.workflow?.status === 'CANCELED', { timeoutMs: 20_000 });
  await page.reload({ waitUntil: 'networkidle' });
  await installCursorOverlay(page);
  await pause(page, 1000);
  await smoothScrollTo(page, page.getByText('Workflow event log'));
  await pause(page, 4000);
});
