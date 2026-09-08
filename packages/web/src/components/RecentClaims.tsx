import { Link } from 'react-router-dom';
import { formatRelative } from '../lib/format';
import type { RecentClaimRef } from '../lib/storage';

/**
 * Recently viewed claims come from localStorage so they survive a refresh, but they are only
 * *references*: opening one always re-reads the authoritative state from Temporal.
 */
export function RecentClaims({
  recent,
  onForget,
  onClear,
}: {
  recent: RecentClaimRef[];
  onForget: (workflowId: string) => void;
  onClear: () => void;
}) {
  return (
    <section className="card">
      <div className="card-header">
        <h2>Recently viewed</h2>
        {recent.length > 0 && (
          <button type="button" className="button ghost small" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
      {recent.length === 0 ? (
        <p className="empty">Claims you open are remembered here across refreshes.</p>
      ) : (
        <ul className="recent-list">
          {recent.map((entry) => (
            <li key={entry.workflowId}>
              <Link className="link mono" to={`/claims/${encodeURIComponent(entry.workflowId)}`}>
                {entry.claimId}
              </Link>
              <span className="muted">{formatRelative(entry.viewedAt)}</span>
              <button
                type="button"
                className="icon-button"
                title="Forget this claim"
                onClick={() => onForget(entry.workflowId)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">
        Stored in <code>localStorage</code>: ids and preferences only — status always comes from
        Temporal.
      </p>
    </section>
  );
}
