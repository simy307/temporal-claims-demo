// Demo 1/6 — Submit a claim through the real dashboard form, watch it progress live.
import { record, waitForClaim, setAdjuster, pause, WEB_BASE } from '../record-helpers.mjs';

await record('01-submit-and-progress', async (page) => {
  await page.goto(`${WEB_BASE}/`, { waitUntil: 'networkidle' });
  await setAdjuster(page, 'Jordan Ellis');
  await pause(page, 800);

  // The form is already pre-filled with a realistic "happy path" sample claim.
  await page.getByRole('button', { name: 'Submit claim' }).scrollIntoViewIfNeeded();
  await pause(page, 600);
  await page.getByRole('button', { name: 'Submit claim' }).click();

  // Wait for the redirect to the claim detail page.
  await page.waitForURL(/\/claims\//, { timeout: 15_000 });
  const workflowId = decodeURIComponent(page.url().split('/claims/')[1]);
  await pause(page, 1200);

  // Let the real workflow progress through validation, coverage, damage assessment and the fraud
  // child workflow, watching the live stage timeline update via polling.
  await waitForClaim(workflowId, (d) => d.state?.phase === 'awaiting-review', { timeoutMs: 60_000 });
  await pause(page, 3500);
});
