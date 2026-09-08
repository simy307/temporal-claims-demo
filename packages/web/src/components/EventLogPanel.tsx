import type { TimelineEvent } from '@claims/shared';
import { formatTime } from '../lib/format';

/** Workflow-authored event log, read from the `getClaimState` query. */
export function EventLogPanel({ events }: { events: TimelineEvent[] }) {
  const ordered = [...events].reverse();
  return (
    <section className="card">
      <div className="card-header">
        <h2>Workflow event log</h2>
        <span className="badge small tone-muted">{events.length} entries</span>
      </div>
      <ul className="event-log">
        {ordered.map((event) => (
          <li key={event.seq} className={`level-${event.level}`}>
            <span className="event-time mono">{formatTime(event.at)}</span>
            <span className="event-stage">{event.stage}</span>
            <span className="event-message">{event.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
