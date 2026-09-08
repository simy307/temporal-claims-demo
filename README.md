# Temporal Claims Console

A complete, runnable demonstration of [Temporal](https://temporal.io) built around a realistic
**insurance claim lifecycle**: a TypeScript monorepo with a NestJS API, a NestJS-hosted Temporal
worker, and a polished React dashboard.

**There is no database.** Temporal's event history is the only source of truth for claim state and
progress. The browser uses `localStorage` for preferences and recently viewed claim ids only —
every status shown in the UI is re-read from Temporal.

---

## Contents

- [What you get](#what-you-get)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Running each piece independently](#running-each-piece-independently)
- [Docker Compose](#docker-compose)
- [Demo script (5 minutes)](#demo-script-5-minutes)
- [Temporal capabilities demonstrated](#temporal-capabilities-demonstrated)
- [The claim workflow](#the-claim-workflow)
- [Failure simulation controls](#failure-simulation-controls)
- [Viewing workflows in the Temporal Web UI](#viewing-workflows-in-the-temporal-web-ui)
- [Repository layout](#repository-layout)
- [API reference](#api-reference)
- [Tests](#tests)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)

---

## What you get

| Piece               | Package          | Port        | Description                                                                    |
| ------------------- | ---------------- | ----------- | ------------------------------------------------------------------------------ |
| React dashboard     | `@claims/web`    | 5173        | Submit claims, watch progress, send signals, break things on purpose           |
| REST API            | `@claims/api`    | 3000        | NestJS facade over the Temporal client (queries, signals, updates, visibility) |
| Worker              | `@claims/worker` | 3100        | NestJS process hosting the Temporal worker, workflows and activities           |
| Shared types        | `@claims/shared` | –           | Request/response types, stage definitions, signal/query names                  |
| Temporal dev server | –                | 7233 / 8233 | gRPC endpoint and Temporal Web UI                                              |

---

## Prerequisites

- **Node.js 20.19+ or 22+** (developed on Node 22) and npm 10+
- **Temporal CLI** — provides the local dev server
  ```bash
  brew install temporal          # macOS
  # or: curl -sSf https://temporal.download/cli.sh | sh
  temporal --version
  ```
- **Docker** (optional) — only needed for the Docker Compose path

> The project installs public npm packages. If your machine has a private npm registry configured
> globally, the repository-local `.npmrc` already points npm at `https://registry.npmjs.org/`.

---

## Quick start

```bash
npm install          # install all workspaces
npm run build        # optional: compile everything once
npm run dev          # Temporal dev server + worker + API + dashboard
```

Then open:

- **Dashboard** → http://localhost:5173
- **Temporal Web UI** → http://localhost:8233

Seed a few interesting claims (in another terminal, once the stack is up):

```bash
npm run seed             # 6 claims covering the happy path, retries, slow calls, fraud, denial, permanent failure
npm run seed -- --approve  # also approve the first claim so you get a completed, paid claim
```

`npm run dev` runs four processes with `concurrently`. Press `Ctrl+C` to stop them all.

---

## Running each piece independently

Each command runs in its own terminal:

```bash
# 1. Temporal dev server (gRPC 7233, Web UI 8233, custom search attributes registered)
npm run temporal

# 2. Temporal worker (workflows + activities, admin API on 3100)
npm run worker

# 3. REST API (NestJS, port 3000)
npm run api

# 4. React dashboard (Vite dev server, port 5173, proxies /api to port 3000)
npm run web
```

Other useful scripts:

| Command                                   | What it does                                                      |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `npm run build`                           | Builds shared → worker → api → web                                |
| `npm run typecheck`                       | Type-checks every package                                         |
| `npm run lint` / `npm run lint:fix`       | ESLint across the monorepo                                        |
| `npm run format` / `npm run format:check` | Prettier                                                          |
| `npm test`                                | Workflow unit tests + integration test + API tests                |
| `npm run test:unit`                       | Fast(er) unit tests only                                          |
| `npm run test:integration`                | The full lifecycle integration test                               |
| `npm run seed`                            | Creates demo claims through the API                               |
| `npm run setup:search-attributes`         | Registers custom search attributes on an existing Temporal server |
| `npm run clean`                           | Removes build output                                              |

If you start the worker or API before Temporal is up, they retry the connection for a minute — the
order of startup does not matter.

---

## Docker Compose

Only the Temporal dev server (handy if you'd rather not install the CLI):

```bash
docker compose up temporal
# then, in another terminal:
npm run dev:app          # worker + API + dashboard against the containerised Temporal
```

The whole stack in containers:

```bash
docker compose --profile app up --build
# dashboard  http://localhost:5173
# API        http://localhost:3000
# Temporal   http://localhost:8233
```

The compose file registers the demo's search attributes on startup and keeps Temporal's SQLite file
in a named volume, so claims survive `docker compose restart` — again, no application database.

---

## Demo script (5 minutes)

1. **Submit a claim.** On the dashboard, keep the _Happy path_ preset and click **Submit claim**.
   You land on the claim page and watch stages complete in real time (polling every 2s).
2. **Watch it park.** The claim stops at **Human adjuster review**: the workflow is blocked on
   `condition(...)` and the UI shows _⏸ Waiting for your decision_ with the reminder-timer count.
3. **Ask for more information.** Click **Request more info** → the claim moves to
   _Waiting for more information_. Fill in the answer and click **Provide information** → it returns
   to review. Both directions are Temporal signals.
4. **Add a note.** The _Adjuster notes_ card uses a Temporal **update** with a validator (try an
   empty note — it is rejected before it reaches workflow state).
5. **Break the payment.** In _Failure simulation_, click **Break payment (permanent)**, then
   **Approve claim**. After the durable settlement timer the payment fails with a non-retryable
   error and the claim parks in **blocked on failure**.
6. **Restart the worker.** While the claim is blocked, open the dashboard home and click
   **Kill & restart worker**. The worker process is killed and respawned; the claim is untouched,
   because its state lives in Temporal.
7. **Recover.** Back on the claim, click **Retry stage & clear the simulated fault** — the payment
   succeeds and the claim completes at 100%.
8. **Refresh the page.** Reload the browser: preferences and _Recently viewed_ survive, and the
   claim state is re-read from Temporal (nothing about status comes from `localStorage`).
9. **Cancel one.** Submit another claim and hit **Cancel claim** while it runs: compensating
   activities release the reserve and notify the claimant before the workflow reports `CANCELED`.

---

## Temporal capabilities demonstrated

| Capability                              | Where                                                                                                                                          | How you see it in the UI                                                              |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Activities with retry policies**      | `packages/worker/src/workflows/claim.workflow.ts` — four `proxyActivities` groups with different `retry` settings and `nonRetryableErrorTypes` | _Activity execution & retries_ panel shows live attempt counters and the last failure |
| **Non-retryable failures**              | `ApplicationFailure` with `type: 'PermanentSystemFailure'` in `activities/simulation.ts`                                                       | Claim parks in _blocked on failure_ with the error text                               |
| **Durable timers**                      | `sleep()` settlement hold before payment                                                                                                       | _Durable settlement hold of Ns started_ in the event log; survives worker restarts    |
| **Timer + indefinite wait**             | Human review loop: `condition(..., reviewReminderSeconds)` inside `for(;;)`                                                                    | Reminder counter increases while the claim waits forever for a human                  |
| **Child workflow**                      | `executeChild(fraudCheckWorkflow, …)` for fraud-risk evaluation                                                                                | _Fraud child workflow ↗_ button links to its own execution in the Temporal UI         |
| **Signals (UI driven)**                 | `approveClaim`, `denyClaim`, `requestMoreInformation`, `provideInformation`, `recoverStage`, `updateSimulation`                                | Every button in the _Adjuster actions_, _Failure simulation_ and recovery panels      |
| **Queries**                             | `getClaimState`, `getProgress`, `getFraudProgress`                                                                                             | The whole claim page: stages, timeline, progress %, awaiting-input state              |
| **Updates (with validator)**            | `addAdjusterNote` returns the new note count and rejects empty notes                                                                           | _Adjuster notes_ card                                                                 |
| **Cancellation handling**               | `isCancellation()` + `CancellationScope.nonCancellable` compensations                                                                          | _Cancel claim_ → reserve released, payment reversed, claimant notified                |
| **Workflow failure handling**           | Failed stages park the workflow instead of crashing it; _abandon_ fails it deliberately                                                        | Recovery panel with **Retry** / **Retry as-is** / **Abandon**                         |
| **Recovery from failure**               | `recoverStage` signal re-runs the failed stage, optionally clearing the fault                                                                  | Claim continues and completes                                                         |
| **Heartbeats & cancellable activities** | `sleepWithHeartbeat()` in the slow damage estimator                                                                                            | Cancelling during a slow call stops the activity promptly                             |
| **Search attributes**                   | `ClaimStatus`, `ClaimType`, `Policyholder`, `ClaimAmount`, `FraudScore` set at start and upserted as the claim advances                        | Claims list is built from Temporal visibility; values shown under _Claim facts_       |
| **Memo**                                | Claim id/policyholder/amount attached at start                                                                                                 | Used to render the claims table                                                       |
| **Meaningful workflow ids**             | `claim-CLM-20260908-K7F2QX`, child `fraud-check-<claimId>`                                                                                     | Shown on the claim page and searchable in the Temporal UI                             |
| **Durability across worker restarts**   | `supervisor.mjs` + `POST /admin/restart`                                                                                                       | _Kill & restart worker_ while claims are mid-flight                                   |
| **Saga-style compensation**             | Reserve booked after coverage, released on denial/cancellation; payment reversed on cancellation                                               | Event log entries during denial/cancel                                                |
| **Event history**                       | `handle.fetchHistory()`                                                                                                                        | _Temporal event history_ panel (activity attempts, timers, signals, child workflows)  |

---

## The claim workflow

`claimWorkflow` (`packages/worker/src/workflows/claim.workflow.ts`) walks a claim through nine
stages. Progress percentage is computed from stage weights in `@claims/shared`, so the workflow and
the UI can never disagree.

| #   | Stage                        | What happens                                                                                                   |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | Claim submitted              | Search attributes + memo recorded, claimant notified                                                           |
| 2   | Initial validation           | `validateClaim` activity; invalid claims are denied automatically                                              |
| 3   | Policy coverage verification | `verifyCoverage`; lapsed/over-limit policies are denied automatically, otherwise a reserve is booked           |
| 4   | Damage assessment            | `assessDamage` — the slow, heartbeating, cancellable external call                                             |
| 5   | Fraud-risk evaluation        | **Child workflow** running two checks in parallel, then scoring                                                |
| 6   | Human adjuster review        | Waits **indefinitely** for `approveClaim` / `denyClaim` / `requestMoreInformation`, nudging on a durable timer |
| 7   | Claim approved or denied     | Decision recorded; reserve released when denied                                                                |
| 8   | Payment processing           | Durable settlement `sleep()` then an idempotent `processPayment`                                               |
| 9   | Claim completed              | Claim archived, claimant notified, workflow result returned                                                    |

Any stage that fails (after its retry policy is exhausted) parks the workflow in
`blocked-on-failure` and waits for a `recoverStage` signal, so failures are recoverable from the UI
instead of terminal.

**Determinism:** workflow code contains no I/O, no randomness and no wall-clock reads other than
Temporal's replay-safe `Date.now()`. Network calls, random values and failure simulation all live in
activities. An ESLint rule (`eslint.config.mjs`) additionally forbids `Math.random`, `setTimeout`
and `fetch` inside `packages/worker/src/workflows/**`.

---

## Failure simulation controls

Every scenario is driven from the UI and executed inside activities — never in workflow code.

| Scenario                                          | How to trigger                                                                | What Temporal does                                                                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Transient failure that succeeds after retries** | _Transient failure_ preset, or _Break payment (transient)_ on a running claim | The activity throws a retryable `ApplicationFailure` for N attempts; the retry policy backs off and retries until it succeeds |
| **Permanent failure**                             | _Permanent failure_ preset, or _Break payment (permanent)_                    | Non-retryable `ApplicationFailure`; the workflow catches it, parks, and waits for your decision                               |
| **Slow external service**                         | _Slow external service_ preset (30s)                                          | The activity heartbeats while it sleeps; cancelling the claim interrupts it                                                   |
| **Worker restart mid-workflow**                   | _Kill & restart worker_ on the dashboard                                      | The worker process exits with code 17, `supervisor.mjs` respawns it, Temporal replays history and the claim continues         |
| **High fraud risk**                               | _High fraud risk_ preset                                                      | Child workflow returns a 90/100 score, flagged for investigation                                                              |
| **Automatic denial**                              | Policy number ending in `-X`, or an amount above the coverage limit           | Human review is skipped and the claim is denied by the workflow itself                                                        |

You can also restart the worker manually — the effect is identical:

```bash
# find and stop the worker process, then start it again
npm run worker
```

---

## Viewing workflow execution in the Temporal Web UI

1. Open **http://localhost:8233**.
2. The **Workflows** list shows every claim; workflow ids look like `claim-CLM-20260908-K7F2QX`.
3. Filter with the custom search attributes, for example:
   - `WorkflowType = "claimWorkflow" AND ClaimStatus = "awaiting-review"`
   - `ClaimType = "auto" AND ClaimAmount > 10000`
   - `FraudScore >= 75`
4. Open a workflow to see:
   - the **event history** (activity scheduling, retries, timers, signals, child workflow),
   - **pending activities** with attempt counts while a retry is in flight,
   - the **child workflow** `fraud-check-<claimId>` (linked from the parent's history),
   - **queries** — run `getClaimState` from the _Queries_ tab to see the exact JSON the dashboard renders.
5. The dashboard links straight to these pages: **Open in Temporal Web UI ↗** and
   **Fraud child workflow ↗** on any claim.

CLI equivalents:

```bash
temporal workflow list --query 'WorkflowType = "claimWorkflow" AND ClaimStatus = "awaiting-review"'
temporal workflow show --workflow-id claim-CLM-20260908-K7F2QX
temporal workflow query --workflow-id claim-CLM-20260908-K7F2QX --name getClaimState
temporal workflow signal --workflow-id claim-CLM-20260908-K7F2QX --name approveClaim \
  --input '{"adjuster":"CLI","approvedAmount":8400}'
```

---

## Repository layout

```
.
├── docker-compose.yml            # Temporal dev server (+ optional app profile)
├── docker/                       # Dockerfiles and nginx config
├── scripts/seed.mjs              # demo data through the API
└── packages/
    ├── shared/                   # @claims/shared — types, stage model, signal/query names
    │   └── src/{types,constants,stages}.ts
    ├── worker/                   # @claims/worker — NestJS host for the Temporal worker
    │   ├── src/workflows/        # claim.workflow.ts, fraud-check.workflow.ts, definitions.ts
    │   ├── src/activities/       # claim, fraud, payment, notification, simulation helpers
    │   ├── src/temporal/         # worker lifecycle service
    │   ├── src/admin/            # restart/health endpoints used by the UI
    │   ├── supervisor.mjs        # respawns the worker for the restart demo
    │   └── test/                 # workflow unit tests + integration test
    ├── api/                      # @claims/api — NestJS REST API
    │   └── src/{claims,temporal,system}/
    └── web/                      # @claims/web — React + Vite dashboard
        └── src/{components,pages,hooks,lib}/
```

Separation of concerns is deliberate:

- **UI** (`web`) never talks to Temporal — only to the REST API.
- **API** (`api`) owns the Temporal _client_: starting workflows, signals, updates, queries,
  visibility. It holds no claim state.
- **Worker** (`worker`) owns _execution_: workflow definitions and activity implementations.
- **Shared** (`shared`) holds the contracts used by all three and has zero runtime dependencies.

---

## API reference

Base URL `http://localhost:3000`.

| Method   | Path                                   | Description                                                                              |
| -------- | -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `POST`   | `/api/claims`                          | Start a claim workflow (returns `claimId`, `workflowId`, `runId`)                        |
| `GET`    | `/api/claims?limit=&query=`            | List claims from Temporal visibility (`query` accepts a Temporal list filter)            |
| `GET`    | `/api/claims/:workflowId`              | Workflow description + `getClaimState` query + pending activities (+ result when closed) |
| `GET`    | `/api/claims/:workflowId/progress`     | `getProgress` query                                                                      |
| `GET`    | `/api/claims/:workflowId/history`      | Summarised Temporal event history                                                        |
| `POST`   | `/api/claims/:workflowId/approve`      | `approveClaim` signal                                                                    |
| `POST`   | `/api/claims/:workflowId/deny`         | `denyClaim` signal                                                                       |
| `POST`   | `/api/claims/:workflowId/request-info` | `requestMoreInformation` signal                                                          |
| `POST`   | `/api/claims/:workflowId/provide-info` | `provideInformation` signal                                                              |
| `POST`   | `/api/claims/:workflowId/recover`      | `recoverStage` signal (`retry` or `abandon`)                                             |
| `POST`   | `/api/claims/:workflowId/simulation`   | `updateSimulation` signal                                                                |
| `POST`   | `/api/claims/:workflowId/notes`        | `addAdjusterNote` **update**                                                             |
| `DELETE` | `/api/claims/:workflowId`              | Cancel (compensations run)                                                               |
| `POST`   | `/api/claims/:workflowId/terminate`    | Terminate (hard kill, no compensations)                                                  |
| `GET`    | `/api/system/config`                   | Task queue, namespace, Temporal UI URL                                                   |
| `GET`    | `/api/system/health`                   | API + Temporal connectivity                                                              |
| `GET`    | `/api/system/worker`                   | Worker identity, start time, restart count                                               |
| `POST`   | `/api/system/worker/restart`           | Restart the worker (demo control)                                                        |

Example:

```bash
curl -X POST http://localhost:3000/api/claims -H 'Content-Type: application/json' -d '{
  "policyNumber": "POL-AUTO-4471",
  "policyholder": "Dana Whitfield",
  "claimType": "auto",
  "incidentDate": "2026-09-01",
  "description": "Rear-ended at a stoplight; bumper and trunk damaged.",
  "amount": 8400,
  "simulation": { "transientFailureStage": "damage-assessment", "transientFailureAttempts": 2 }
}'
```

---

## Tests

```bash
npm test                 # everything
npm run test:unit        # workflow logic + API service tests
npm run test:integration # full lifecycle against a real local Temporal server
```

- `packages/worker/test/unit/stages.test.ts` — pure stage/progress logic (the maths behind the
  progress bar and the timeline).
- `packages/worker/test/unit/claim-workflow.test.ts` — the workflow itself with mocked activities:
  human review pause + approval + payment, denial, request/provide information round trip,
  automatic denial, failure → recovery signal, abandon, cancellation with compensation, stray
  signals, update validation.
- `packages/worker/test/integration/claim-lifecycle.test.ts` — **the integration test**: starts a
  claim with the _real_ activities, survives two simulated transient failures, reaches human review,
  sends the approval signal, and verifies the claim completes, pays, and is findable through a
  search-attribute query. It also asserts the fraud **child workflow** completed.
- `packages/api/test/claims.service.spec.ts` — API service: workflow start options (ids, search
  attributes, memo), visibility mapping, describe+query merging, signal routing, error mapping.

The Temporal test environments download and cache a Temporal dev server binary on first run, so the
first `npm test` needs network access and takes a little longer.

---

## Configuration

Everything has sensible defaults; override with environment variables when needed.

| Variable                     | Default                 | Used by                           |
| ---------------------------- | ----------------------- | --------------------------------- |
| `TEMPORAL_ADDRESS`           | `localhost:7233`        | api, worker                       |
| `TEMPORAL_NAMESPACE`         | `default`               | api, worker                       |
| `TEMPORAL_TASK_QUEUE`        | `claims-task-queue`     | api, worker                       |
| `TEMPORAL_UI_URL`            | `http://localhost:8233` | api (link shown in the dashboard) |
| `API_PORT`                   | `3000`                  | api                               |
| `WORKER_ADMIN_PORT`          | `3100`                  | worker                            |
| `WORKER_ADMIN_URL`           | `http://localhost:3100` | api (restart proxy)               |
| `WORKFLOW_EXECUTION_TIMEOUT` | `7 days`                | api                               |
| `VITE_API_PROXY`             | `http://localhost:3000` | web dev server                    |

---

## Troubleshooting

**“search attribute ClaimStatus is not defined”** — the Temporal server was started without the
custom search attributes. Use `npm run temporal` (which registers them), or register them against a
running server with `npm run setup:search-attributes`.

**Dashboard shows “Could not reach the API”** — make sure `npm run api` is running on port 3000; the
Vite dev server proxies `/api` there.

**Worker says “Temporal not reachable … retrying”** — the dev server is still booting; the worker
retries for a minute. Check `temporal operator cluster health`.

**Newly created claim missing from the list** — Temporal's visibility index is eventually
consistent. The claim page itself is immediate, and the dashboard remembers the claim under
_Recently viewed_.

**Port already in use** — change `API_PORT`, `WORKER_ADMIN_PORT`, or the Vite port, or stop the
process holding the port.

**Reset everything** — stop the stack and delete the dev server database:

```bash
rm -rf .temporal
```
