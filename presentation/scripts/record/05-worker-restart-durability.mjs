// Demo 5/6 — THE moment: kill the worker process mid-claim, restart it, and watch the blocked
// claim resume exactly where it left off. Nothing here is faked — the worker really exits and a
// new process really takes over the task queue.
import {
  record,
  createClaim,
  waitForClaim,
  setAdjuster,
  pause,
  WEB_BASE,
  API_BASE,
} from '../record-helpers.mjs';

async function currentWorkerId() {
  const res = await fetch(`${API_BASE}/api/system/worker`);
  return (await res.json()).workerId;
}

const { workflowId } = await createClaim({
  policyholder: 'Priya Raman',
  policyNumber: 'POL-HEALTH-7781',
  claimType: 'health',
  amount: 5600,
  description: 'Emergency room visit after a cycling accident.',
  contactEmail: 'priya.raman@example.com',
  simulation: { permanentFailureStage: 'payment' },
  paymentHoldSeconds: 2,
  reviewReminderSeconds: 600,
});

await waitForClaim(workflowId, (d) => d.state?.phase === 'awaiting-review', { timeoutMs: 60_000 });

const workerBefore = await currentWorkerId();
console.log('worker before:', workerBefore);

await record('05-worker-restart-durability', async (page) => {
  // 1. Approve, then let payment fail permanently — the claim parks, blocked.
  await page.goto(`${WEB_BASE}/claims/${workflowId}`, { waitUntil: 'networkidle' });
  await setAdjuster(page, 'Jordan Ellis');
  await pause(page, 1000);
  await page.getByRole('button', { name: 'Approve claim' }).click();
  await waitForClaim(workflowId, (d) => d.state?.phase === 'blocked-on-failure', { timeoutMs: 30_000 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('WORKFLOW BLOCKED', { exact: false }).scrollIntoViewIfNeeded();
  await pause(page, 2500);

  // 2. Go to the dashboard and kill the worker process while the claim is blocked mid-flight.
  await page.goto(`${WEB_BASE}/`, { waitUntil: 'networkidle' });
  await page.getByText('Worker', { exact: true }).scrollIntoViewIfNeeded();
  await pause(page, 1200);
  await page.getByRole('button', { name: 'Kill & restart worker' }).click();
  await pause(page, 1500);

  // 3. Wait for the new worker process (a new generation) to come back up and start polling again.
  const deadline = Date.now() + 30_000;
  let workerAfter = workerBefore;
  while (Date.now() < deadline && workerAfter === workerBefore) {
    await pause(page, 800);
    workerAfter = await currentWorkerId();
  }
  console.log('worker after:', workerAfter);
  if (workerAfter === workerBefore) throw new Error('Worker did not restart in time');
  await pause(page, 2500);

  // 4. Go back to the claim: it is untouched — still blocked, history intact, nothing lost.
  await page.goto(`${WEB_BASE}/claims/${workflowId}`, { waitUntil: 'networkidle' });
  await page.getByText('WORKFLOW BLOCKED', { exact: false }).scrollIntoViewIfNeeded();
  await pause(page, 3000);

  // 5. Recover it — proving the whole thing still works end to end after the restart.
  await page
    .getByRole('button', { name: 'Retry stage & clear the simulated fault' })
    .click();
  await pause(page, 600);
  await waitForClaim(workflowId, (d) => d.state?.phase === 'completed', { timeoutMs: 20_000 });
  await pause(page, 3000);
});
