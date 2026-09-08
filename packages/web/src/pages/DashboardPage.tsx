import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ClaimSummary } from '@claims/shared';
import { ClaimsTable } from '../components/ClaimsTable';
import { NewClaimForm } from '../components/NewClaimForm';
import { RecentClaims } from '../components/RecentClaims';
import { WorkerPanel } from '../components/WorkerPanel';
import { usePolling } from '../hooks/usePolling';
import { usePreferences } from '../hooks/usePreferences';
import { api } from '../lib/api';
import { formatRelative } from '../lib/format';
import { clearRecentClaims, forgetClaim, loadRecentClaims, rememberClaim } from '../lib/storage';

export function DashboardPage() {
  const navigate = useNavigate();
  const { preferences, update } = usePreferences();
  const [recent, setRecent] = useState(() => loadRecentClaims());

  const claims = usePolling<ClaimSummary[]>(
    useCallback(() => api.listClaims(100), []),
    preferences.pollIntervalMs,
  );

  const list = claims.data ?? [];
  const waiting = list.filter((claim) =>
    ['awaiting-review', 'awaiting-information', 'blocked-on-failure'].includes(
      claim.claimStatus ?? '',
    ),
  ).length;
  const running = list.filter((claim) => claim.workflowStatus === 'RUNNING').length;
  const completed = list.filter((claim) => claim.workflowStatus === 'COMPLETED').length;

  const onCreated = (workflowId: string, claimId: string) => {
    setRecent(rememberClaim({ workflowId, claimId }));
    void claims.refresh();
    navigate(`/claims/${encodeURIComponent(workflowId)}`);
  };

  return (
    <div className="page dashboard">
      <section className="stat-row">
        <Stat label="Claims tracked" value={list.length} hint="from Temporal visibility" />
        <Stat label="Running" value={running} tone="active" />
        <Stat label="Waiting on a human" value={waiting} tone="waiting" />
        <Stat label="Completed" value={completed} tone="success" />
        <Stat
          label="Last refresh"
          value={
            claims.lastUpdatedAt
              ? formatRelative(new Date(claims.lastUpdatedAt).toISOString())
              : '—'
          }
          hint={
            preferences.pollIntervalMs === 0
              ? 'polling off'
              : `every ${preferences.pollIntervalMs / 1000}s`
          }
        />
      </section>

      {claims.error && (
        <div className="banner error">
          Could not reach the API: {claims.error}. Is the API running on port 3000?
        </div>
      )}

      <div className="columns">
        <div className="column main">
          <NewClaimForm onCreated={onCreated} />
          <ClaimsTable
            claims={list}
            filter={preferences.statusFilter}
            onFilterChange={(statusFilter) => update({ statusFilter })}
          />
        </div>
        <div className="column side">
          <RecentClaims
            recent={recent}
            onForget={(workflowId) => setRecent(forgetClaim(workflowId))}
            onClear={() => {
              clearRecentClaims();
              setRecent([]);
            }}
          />
          <WorkerPanel />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = 'muted',
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className={`stat tone-${tone}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}
