import type { PendingActivityInfo } from '@claims/shared';
import { formatDateTime } from '../lib/format';

/**
 * Live view of Temporal's pending activities. When an activity is being retried you can watch the
 * attempt counter climb and read the failure from the previous attempt.
 */
export function PendingActivitiesPanel({ activities }: { activities: PendingActivityInfo[] }) {
  return (
    <section className="card">
      <div className="card-header">
        <h2>Activity execution &amp; retries</h2>
        <span className="badge small tone-muted">{activities.length} in flight</span>
      </div>
      {activities.length === 0 ? (
        <p className="empty">
          No activity is currently scheduled or retrying. Arm a failure below and watch this panel.
        </p>
      ) : (
        <ul className="activity-list">
          {activities.map((activity) => (
            <li key={activity.activityId} className={activity.attempt > 1 ? 'is-retrying' : ''}>
              <div className="activity-heading">
                <strong className="mono">{activity.activityType}</strong>
                <span
                  className={`badge small ${activity.attempt > 1 ? 'tone-warning' : 'tone-active'}`}
                >
                  attempt {activity.attempt}
                  {activity.maximumAttempts ? ` / ${activity.maximumAttempts}` : ''}
                </span>
                <span className="badge small tone-muted">{activity.state}</span>
              </div>
              {activity.lastFailure && <p className="activity-error">{activity.lastFailure}</p>}
              <div className="timeline-meta">
                <span>scheduled {formatDateTime(activity.scheduledAt)}</span>
                {activity.lastStartedAt && (
                  <span>started {formatDateTime(activity.lastStartedAt)}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
