import { Link } from 'react-router-dom';
import type { ClaimSummary } from '@claims/shared';
import { formatDateTime, formatMoney, titleCase } from '../lib/format';
import { WorkflowBadge } from './Badges';

const WAITING_STATUSES = ['awaiting-review', 'awaiting-information', 'blocked-on-failure'];

export function ClaimsTable({
  claims,
  filter,
  onFilterChange,
}: {
  claims: ClaimSummary[];
  filter: 'all' | 'open' | 'waiting' | 'closed';
  onFilterChange: (filter: 'all' | 'open' | 'waiting' | 'closed') => void;
}) {
  const filtered = claims.filter((claim) => {
    switch (filter) {
      case 'open':
        return claim.workflowStatus === 'RUNNING';
      case 'waiting':
        return WAITING_STATUSES.includes(claim.claimStatus ?? '');
      case 'closed':
        return claim.workflowStatus !== 'RUNNING';
      default:
        return true;
    }
  });

  return (
    <section className="card">
      <div className="card-header">
        <h2>
          All claims <span className="muted">({claims.length} from Temporal visibility)</span>
        </h2>
        <div className="segmented">
          {(['all', 'open', 'waiting', 'closed'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={filter === option ? 'is-active' : ''}
              onClick={() => onFilterChange(option)}
            >
              {titleCase(option)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="empty">No claims match this filter yet.</p>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Claim</th>
                <th>Policyholder</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Claim status</th>
                <th>Workflow</th>
                <th>Fraud</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((claim) => (
                <tr key={claim.workflowId}>
                  <td>
                    <Link className="link" to={`/claims/${encodeURIComponent(claim.workflowId)}`}>
                      {claim.claimId}
                    </Link>
                  </td>
                  <td>{claim.policyholder ?? '—'}</td>
                  <td>{claim.claimType ? titleCase(claim.claimType) : '—'}</td>
                  <td>{formatMoney(claim.amount)}</td>
                  <td>
                    {claim.claimStatus ? (
                      <span
                        className={`badge small ${
                          WAITING_STATUSES.includes(claim.claimStatus)
                            ? 'tone-waiting'
                            : 'tone-muted'
                        }`}
                      >
                        {claim.claimStatus}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <WorkflowBadge status={claim.workflowStatus} />
                  </td>
                  <td>{claim.fraudScore ?? '—'}</td>
                  <td className="muted">{formatDateTime(claim.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
