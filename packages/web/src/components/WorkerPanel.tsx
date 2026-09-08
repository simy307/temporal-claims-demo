import { useCallback, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { useToasts } from '../hooks/useToasts';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';

/** Worker health plus the "restart the worker mid-workflow" demo control. */
export function WorkerPanel() {
  const { push } = useToasts();
  const [restarting, setRestarting] = useState(false);
  const worker = usePolling(
    useCallback(() => api.worker(), []),
    3000,
  );

  const restart = async (graceful: boolean) => {
    setRestarting(true);
    try {
      const response = await api.restartWorker(graceful);
      push('info', response.note ?? 'Worker restart requested');
    } catch (error) {
      push('error', error instanceof Error ? error.message : String(error));
    } finally {
      window.setTimeout(() => setRestarting(false), 2000);
    }
  };

  const data = worker.data;

  return (
    <section className="card">
      <div className="card-header">
        <h2>Worker</h2>
        <span className={`badge small ${data?.status === 'ok' ? 'tone-success' : 'tone-error'}`}>
          {data?.status === 'ok' ? 'running' : 'unreachable'}
        </span>
      </div>

      <dl className="definition">
        <dt>Identity</dt>
        <dd className="mono">{data?.workerId ?? '—'}</dd>
        <dt>Task queue</dt>
        <dd className="mono">{data?.taskQueue ?? '—'}</dd>
        <dt>Started</dt>
        <dd>{formatDateTime(data?.startedAt)}</dd>
        <dt>Restarts</dt>
        <dd>{data?.restarts ?? 0}</dd>
      </dl>

      <div className="button-row">
        <button
          type="button"
          className="button warning"
          disabled={restarting}
          onClick={() => restart(false)}
        >
          {restarting ? 'Restarting…' : 'Kill & restart worker'}
        </button>
        <button
          type="button"
          className="button ghost"
          disabled={restarting}
          onClick={() => restart(true)}
        >
          Graceful restart
        </button>
      </div>
      <p className="hint">
        Restart the worker while a claim is mid-flight: Temporal replays the workflow history on the
        new worker and the claim continues exactly where it was, including running timers.
      </p>
      {worker.error && <p className="hint error">{worker.error}</p>}
    </section>
  );
}
