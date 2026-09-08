#!/usr/bin/env node
/**
 * Seeds the demo with a handful of claims that show off different Temporal behaviours.
 *
 * Usage:
 *   npm run seed                # create the demo claims
 *   npm run seed -- --approve   # also approve the claim that is waiting for review
 *   API_URL=http://localhost:3000 npm run seed
 */

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const approve = process.argv.includes('--approve');

const today = new Date();
const isoDate = (daysAgo) =>
  new Date(today.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const CLAIMS = [
  {
    label: 'happy path — parks in human review',
    body: {
      policyNumber: 'POL-AUTO-4471',
      policyholder: 'Dana Whitfield',
      claimType: 'auto',
      incidentDate: isoDate(3),
      description: 'Rear-ended at a stoplight; bumper, trunk and tail lights damaged.',
      amount: 8400,
      contactEmail: 'dana.whitfield@example.com',
      paymentHoldSeconds: 10,
      reviewReminderSeconds: 45,
    },
  },
  {
    label: 'transient activity failure — recovered by the retry policy',
    body: {
      policyNumber: 'POL-HOME-2210',
      policyholder: 'Marcus Feld',
      claimType: 'home',
      incidentDate: isoDate(9),
      description: 'Burst pipe flooded the basement and damaged flooring and drywall.',
      amount: 32500,
      contactEmail: 'marcus.feld@example.com',
      simulation: { transientFailureStage: 'damage-assessment', transientFailureAttempts: 2 },
    },
  },
  {
    label: 'slow external service — heartbeating activity',
    body: {
      policyNumber: 'POL-TRVL-8890',
      policyholder: 'Ines Kowalski',
      claimType: 'travel',
      incidentDate: isoDate(14),
      description: 'Checked luggage lost on an international connection; contents claimed.',
      amount: 2400,
      contactEmail: 'ines.k@example.com',
      simulation: { slowStage: 'damage-assessment', slowMs: 30000 },
    },
  },
  {
    label: 'high fraud risk — flagged for investigation',
    body: {
      policyNumber: 'POL-AUTO-3312',
      policyholder: 'Victor Reyes',
      claimType: 'auto',
      incidentDate: isoDate(60),
      description: 'Vehicle stolen from a parking garage; needs settlement urgently in cash.',
      amount: 41000,
      contactEmail: 'victor.reyes@example.com',
      simulation: { forceFraudScore: 90 },
    },
  },
  {
    label: 'automatic denial — lapsed policy',
    body: {
      policyNumber: 'POL-HEALTH-7781-X',
      policyholder: 'Priya Raman',
      claimType: 'health',
      incidentDate: isoDate(5),
      description: 'Emergency room visit after a cycling accident.',
      amount: 5600,
      contactEmail: 'priya.raman@example.com',
    },
  },
  {
    label: 'permanent payment failure — waits for a recovery signal',
    body: {
      policyNumber: 'POL-AUTO-9001',
      policyholder: 'Ade Balogun',
      claimType: 'auto',
      incidentDate: isoDate(2),
      description: 'Hail damage across the roof, hood and windshield of the vehicle.',
      amount: 12750,
      contactEmail: 'ade.balogun@example.com',
      simulation: { permanentFailureStage: 'payment' },
      paymentHoldSeconds: 3,
    },
  },
];

async function request(path, init) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  if (!response.ok) {
    throw new Error(
      `${init?.method ?? 'GET'} ${path} failed: ${response.status} ${await response.text()}`,
    );
  }
  return response.status === 204 ? undefined : response.json();
}

async function waitForApi() {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await request('/api/system/health');
      return;
    } catch {
      process.stdout.write('.');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error(`API at ${API_URL} never became healthy`);
}

async function main() {
  console.log(`Seeding demo claims via ${API_URL}`);
  await waitForApi();

  const created = [];
  for (const claim of CLAIMS) {
    const response = await request('/api/claims', {
      method: 'POST',
      body: JSON.stringify(claim.body),
    });
    created.push({ ...response, label: claim.label });
    console.log(`  ✓ ${response.claimId.padEnd(20)} ${claim.label}`);
  }

  if (approve) {
    const [first] = created;
    console.log(`\nWaiting for ${first.claimId} to reach human review…`);
    for (let attempt = 1; attempt <= 60; attempt += 1) {
      const detail = await request(`/api/claims/${first.workflowId}`);
      if (detail.state?.phase === 'awaiting-review') {
        await request(`/api/claims/${first.workflowId}/approve`, {
          method: 'POST',
          body: JSON.stringify({ adjuster: 'Seed Script', notes: 'Approved by the seed script' }),
        });
        console.log(`  ✓ approved ${first.claimId}`);
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.log(
    '\nOpen the dashboard at http://localhost:5173 and the Temporal UI at http://localhost:8233',
  );
}

main().catch((error) => {
  console.error(`\nSeeding failed: ${error.message}`);
  process.exit(1);
});
