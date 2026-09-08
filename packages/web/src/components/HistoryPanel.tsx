import { useCallback, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { api } from '../lib/api';
import { formatTime } from '../lib/format';

const INTERESTING = /ACTIVITY|TIMER|SIGNAL|CHILD|WORKFLOW_EXECUTION|UPDATE/;

/** Raw Temporal event history — proof that the durable log, not the API, holds the truth. */
export function HistoryPanel({ workflowId, pollMs }: { workflowId: string; pollMs: number }) {
  const [expanded, setExpanded] = useState(false);
  const [onlyInteresting, setOnlyInteresting] = useState(true);
  const history = usePolling(
    useCallback(() => api.getHistory(workflowId, 300), [workflowId]),
    expanded ? Math.max(pollMs, 3000) : 0,
    expanded,
  );

  const events = (history.data ?? []).filter(
    (event) => !onlyInteresting || INTERESTING.test(event.eventType),
  );

  return (
    <section className="card">
      <div className="card-header">
        <h2>Temporal event history</h2>
        <div className="button-row">
          {expanded && (
            <label className="checkbox">
              <input
                type="checkbox"
                checked={onlyInteresting}
                onChange={(event) => setOnlyInteresting(event.target.checked)}
              />
              key events only
            </label>
          )}
          <button
            type="button"
            className="button ghost small"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="history-scroll">
          {history.error && <p className="hint error">{history.error}</p>}
          <table className="table compact">
            <tbody>
              {events.map((event) => (
                <tr key={event.eventId}>
                  <td className="mono muted">{event.eventId}</td>
                  <td className="mono muted">{formatTime(event.eventTime)}</td>
                  <td className="mono">{event.eventType}</td>
                  <td className="muted">{event.details ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
