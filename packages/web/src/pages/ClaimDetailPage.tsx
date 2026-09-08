import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { isWaitingOnHuman, type ClaimDetailResponse } from '@claims/shared';
import { ActionPanel } from '../components/ActionPanel';
import { PhaseBadge, WorkflowBadge } from '../components/Badges';
import { EventLogPanel } from '../components/EventLogPanel';
import { HistoryPanel } from '../components/HistoryPanel';
import { NotesPanel } from '../components/NotesPanel';
import { PendingActivitiesPanel } from '../components/PendingActivitiesPanel';
import { ProgressBar } from '../components/ProgressBar';
import { SimulationPanel } from '../components/SimulationPanel';
import { StageTimeline } from '../components/StageTimeline';
import { usePolling } from '../hooks/usePolling';
import { usePreferences } from '../hooks/usePreferences';
import { useToasts } from '../hooks/useToasts';
import { api } from '../lib/api';
import { formatDateTime, formatMoney, formatRelative, titleCase } from '../lib/format';
import { forgetClaim, rememberClaim } from '../lib/storage';

export function ClaimDetailPage() {
  const { workflowId = '' } = useParams();
  const navigate = useNavigate();
  const { preferences } = usePreferences();
  const { push } = useToasts();
  const [temporalUiUrl, setTemporalUiUrl] = useState('http://localhost:8233');
  const [busy, setBusy] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  const scrollToActions = () => {
    actionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const detail = usePolling<ClaimDetailResponse>(
    useCallback(() => api.getClaim(workflowId), [workflowId]),
    preferences.pollIntervalMs,
  );

  useEffect(() => {
    api
      .config()
      .then((config) => setTemporalUiUrl(config.temporalUiUrl))
      .catch(() => undefined);
  }, []);

  // Remember the *reference* only; the authoritative state is always fetched above.
  useEffect(() => {
    const claimId = detail.data?.state?.claimId ?? workflowId.replace(/^claim-/, '');
    if (detail.data) {
      rememberClaim({ workflowId, claimId });
    }
  }, [detail.data, workflowId]);

  const data = detail.data;
  const state = data?.state ?? null;

  const runCommand = async (label: string, action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      push('success', label);
      await detail.refresh();
    } catch (error) {
      push('error', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  if (detail.loading && !data) {
    return <div className="page">Loading claim from Temporal…</div>;
  }

  if (detail.error && !data) {
    return (
      <div className="page">
        <div className="banner error">
          <span>{detail.error}</span>
          <span className="button-row">
            <button type="button" className="button ghost small" onClick={() => detail.refresh()}>
              Retry
            </button>
            <button
              type="button"
              className="button ghost small"
              onClick={() => {
                forgetClaim(workflowId);
                navigate('/');
              }}
            >
              Forget this claim
            </button>
          </span>
        </div>
        <p className="hint">
          This claim id came from your browser's recently-viewed list, but Temporal has no such
          workflow (for example after the dev server database was reset). Nothing about claim state
          is stored in the browser.
        </p>
      </div>
    );
  }

  const workflow = data!.workflow;
  const isClosed = workflow.status !== 'RUNNING';

  return (
    <div className="page detail">
      <section className="card claim-header">
        <div className="claim-title">
          <div>
            <h1>{state?.claimId ?? workflow.workflowId}</h1>
            <p className="mono muted">
              workflow <strong>{workflow.workflowId}</strong> · run {workflow.runId.slice(0, 8)}… ·{' '}
              {workflow.historyLength} history events
            </p>
          </div>
          <div className="badge-row">
            {state && <PhaseBadge phase={state.phase} />}
            <WorkflowBadge status={workflow.status} />
            {state?.fraud && (
              <span
                className={`badge ${
                  state.fraud.band === 'high'
                    ? 'tone-error'
                    : state.fraud.band === 'medium'
                      ? 'tone-warning'
                      : 'tone-success'
                }`}
              >
                fraud {state.fraud.score}/100
              </span>
            )}
          </div>
        </div>

        <ProgressBar
          value={state?.progress ?? 0}
          tone={state && isWaitingOnHuman(state.phase) ? 'waiting' : 'active'}
        />

        {/* The action panel lives in the side column, which stacks below the timeline on narrow
            screens. Surface an unmissable prompt (and a jump link) whenever a human is blocking. */}
        {state && isWaitingOnHuman(state.phase) && (
          <div className={`banner ${state.phase === 'blocked-on-failure' ? 'error' : 'waiting'}`}>
            <span>
              <strong>This claim is waiting for you.</strong>{' '}
              {state.awaiting.kind === 'human-review'
                ? 'Approve, deny, or request more information to release the workflow.'
                : state.awaiting.kind === 'more-information'
                  ? `Information requested by ${state.awaiting.requestedBy}: “${state.awaiting.question}”`
                  : state.awaiting.kind === 'failure-recovery'
                    ? `Stage "${state.awaiting.stage}" failed — retry it or abandon the claim.`
                    : ''}
            </span>
            <button type="button" className="button primary small" onClick={scrollToActions}>
              Go to controls ↓
            </button>
          </div>
        )}

        <div className="claim-meta">
          <span>Policyholder: {state?.input.policyholder ?? '—'}</span>
          <span>Policy: {state?.input.policyNumber ?? '—'}</span>
          <span>Type: {state?.input.claimType ? titleCase(state.input.claimType) : '—'}</span>
          <span>Claimed: {formatMoney(state?.input.amount)}</span>
          <span>Started: {formatDateTime(workflow.startedAt)}</span>
          {workflow.closedAt && <span>Closed: {formatDateTime(workflow.closedAt)}</span>}
          <span>
            Updated{' '}
            {detail.lastUpdatedAt
              ? formatRelative(new Date(detail.lastUpdatedAt).toISOString())
              : '—'}
          </span>
        </div>

        <div className="button-row">
          <button type="button" className="button ghost" onClick={() => detail.refresh()}>
            Refresh now
          </button>
          <a
            className="button ghost"
            href={`${temporalUiUrl}/namespaces/${encodeURIComponent(
              'default',
            )}/workflows/${encodeURIComponent(workflow.workflowId)}`}
            target="_blank"
            rel="noreferrer"
          >
            Open in Temporal Web UI ↗
          </a>
          {state?.fraudChildWorkflowId && (
            <a
              className="button ghost"
              href={`${temporalUiUrl}/namespaces/default/workflows/${encodeURIComponent(
                state.fraudChildWorkflowId,
              )}`}
              target="_blank"
              rel="noreferrer"
            >
              Fraud child workflow ↗
            </a>
          )}
          <button
            type="button"
            className="button warning"
            disabled={busy || isClosed}
            onClick={() =>
              runCommand('Cancellation requested — compensations will run', () =>
                api.cancel(workflowId),
              )
            }
          >
            Cancel claim
          </button>
          <button
            type="button"
            className="button danger"
            disabled={busy || isClosed}
            onClick={() =>
              runCommand('Workflow terminated', () =>
                api.terminate(workflowId, 'terminated from the claims console'),
              )
            }
          >
            Terminate (hard kill)
          </button>
        </div>

        {data!.result && (
          <div className={`banner ${data!.result.outcome === 'approved' ? 'success' : 'warning'}`}>
            Final result: <strong>{data!.result.outcome}</strong> · {data!.result.summary}
          </div>
        )}
        {data!.resultError && (
          <div className={`banner ${workflow.status === 'CANCELED' ? 'warning' : 'error'}`}>
            {workflow.status === 'CANCELED'
              ? 'Workflow was cancelled — compensating activities ran before it closed.'
              : `Workflow error: ${data!.resultError}`}
          </div>
        )}
        {data!.stateError && (
          <div className="banner warning">
            Live state query unavailable ({data!.stateError}). Workflow status above still comes
            from Temporal.
          </div>
        )}
      </section>

      {state && (
        <div className="columns">
          <div className="column main">
            <section className="card">
              <div className="card-header">
                <h2>Claim lifecycle</h2>
                <span className="badge small tone-muted">{state.progress}% complete</span>
              </div>
              <StageTimeline state={state} />
            </section>
            <EventLogPanel events={state.timeline} />
          </div>

          <div className="column side">
            <div ref={actionsRef}>
              <ActionPanel
                workflowId={workflowId}
                state={state}
                adjuster={preferences.adjusterName}
                onChanged={() => detail.refresh()}
              />
            </div>
            <PendingActivitiesPanel activities={data!.pendingActivities} />
            <FactsPanel detail={data!} />
            <SimulationPanel
              workflowId={workflowId}
              state={state}
              disabled={isClosed}
              onChanged={() => detail.refresh()}
            />
            <NotesPanel
              workflowId={workflowId}
              notes={state.notes}
              author={preferences.adjusterName}
              disabled={isClosed}
              onChanged={() => detail.refresh()}
            />
            <HistoryPanel workflowId={workflowId} pollMs={preferences.pollIntervalMs} />
          </div>
        </div>
      )}
    </div>
  );
}

function FactsPanel({ detail }: { detail: ClaimDetailResponse }) {
  const state = detail.state!;
  return (
    <section className="card">
      <div className="card-header">
        <h2>Claim facts</h2>
      </div>
      <dl className="definition">
        <dt>Validation</dt>
        <dd>
          {state.validation
            ? state.validation.valid
              ? 'passed'
              : state.validation.issues.join('; ')
            : '—'}
        </dd>
        <dt>Coverage</dt>
        <dd>{state.coverage ? state.coverage.reason : '—'}</dd>
        <dt>Deductible</dt>
        <dd>{state.coverage ? formatMoney(state.coverage.deductible) : '—'}</dd>
        <dt>Damage estimate</dt>
        <dd>
          {state.assessment
            ? `${formatMoney(state.assessment.estimatedRepairCost)} (${state.assessment.severity}, ${state.assessment.inspector})`
            : '—'}
        </dd>
        <dt>Fraud signals</dt>
        <dd>
          {state.fraud && state.fraud.signals.length > 0
            ? state.fraud.signals.map((signal) => signal.code).join(', ')
            : state.fraud
              ? 'none'
              : '—'}
        </dd>
        <dt>Reserve</dt>
        <dd>
          {state.reserve
            ? `${state.reserve.reserveId} · ${formatMoney(state.reserve.amount)}`
            : '—'}
        </dd>
        <dt>Decision</dt>
        <dd>
          {state.decision
            ? `${state.decision.outcome} by ${state.decision.decidedBy}${state.decision.automatic ? ' (automatic)' : ''} — ${state.decision.reason}`
            : '—'}
        </dd>
        <dt>Payment</dt>
        <dd>
          {state.payment
            ? `${state.payment.paymentId} · ${formatMoney(state.payment.amount)} via ${state.payment.method}`
            : '—'}
        </dd>
        <dt>Information requests</dt>
        <dd>
          {state.informationRequests.length === 0
            ? 'none'
            : state.informationRequests
                .map(
                  (request) =>
                    `${request.question}${request.answer ? ` → ${request.answer}` : ' (unanswered)'}`,
                )
                .join(' | ')}
        </dd>
        <dt>Recoveries</dt>
        <dd>{state.recoveryCount}</dd>
        <dt>Search attributes</dt>
        <dd className="mono small">
          {Object.entries(detail.workflow.searchAttributes)
            .filter(([key]) => !key.startsWith('Temporal') && key !== 'BuildIds')
            .map(([key, value]) => `${key}=${String(value)}`)
            .join(' · ')}
        </dd>
      </dl>
    </section>
  );
}
