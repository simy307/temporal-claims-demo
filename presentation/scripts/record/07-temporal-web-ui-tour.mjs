// Bonus demo — a tour of the real Temporal Web UI: the workflow list with a search-attribute
// query, the event history timeline, a live getClaimState query, and the fraud child workflow.
import {
  record,
  createClaim,
  waitForClaim,
  pause,
  installCursorOverlay,
  clickWithEmphasis,
} from '../record-helpers.mjs';

const TEMPORAL_UI = 'http://localhost:8233';

// A fresh, awaiting-review claim gives the tour something interesting to look at and query.
const { workflowId, runId } = await createClaim({
  policyholder: 'Nina Torres',
  policyNumber: 'POL-HOME-5150',
  claimType: 'home',
  amount: 18600,
  description: 'Kitchen fire damaged cabinets, countertop and ceiling drywall.',
  contactEmail: 'nina@example.com',
  reviewReminderSeconds: 600,
});
await waitForClaim(workflowId, (d) => d.state?.phase === 'awaiting-review', { timeoutMs: 60_000 });

await record('07-temporal-web-ui-tour', async (page) => {
  // 1. Workflow list, filtered with a Temporal visibility query using our custom search attributes.
  await page.goto(
    `${TEMPORAL_UI}/namespaces/default/workflows?query=${encodeURIComponent(
      "WorkflowType = 'claimWorkflow' AND ClaimStatus = 'awaiting-review'",
    )}`,
    { waitUntil: 'load' },
  );
  await installCursorOverlay(page);
  await pause(page, 3000);

  // 2. Open the fresh claim's Timeline — shows every activity, retry, timer and the child workflow.
  await page.goto(`${TEMPORAL_UI}/namespaces/default/workflows/${workflowId}/${runId}`, {
    waitUntil: 'load',
  });
  await installCursorOverlay(page);
  await pause(page, 3500);

  // 3. Run the getClaimState query directly against the workflow — no custom UI involved.
  await clickWithEmphasis(page, page.getByRole('tab', { name: 'Queries' }));
  await pause(page, 1000);
  await clickWithEmphasis(page, page.getByRole('button', { name: /Run Query|Refresh Query/ }));
  await pause(page, 3500);

  // 4. Jump to the fraud-check child workflow — its own history, own timeline.
  const childId = `fraud-check-${workflowId.replace('claim-', '')}`;
  await page.goto(`${TEMPORAL_UI}/namespaces/default/workflows/${childId}`, { waitUntil: 'load' });
  await installCursorOverlay(page);
  await pause(page, 3500);
});
