import { useState } from 'react';
import { SIMULATABLE_STAGES, type ClaimState, type StageId } from '@claims/shared';
import { api } from '../lib/api';
import { useToasts } from '../hooks/useToasts';
import { titleCase } from '../lib/format';

/**
 * Live failure injection. Changes are delivered to the running workflow with the
 * `updateSimulation` signal and applied by the next activity call.
 */
export function SimulationPanel({
  workflowId,
  state,
  onChanged,
  disabled,
}: {
  workflowId: string;
  state: ClaimState;
  onChanged: () => void;
  disabled: boolean;
}) {
  const { push } = useToasts();
  const [busy, setBusy] = useState(false);
  const simulation = state.simulation;

  const patch = async (label: string, body: Parameters<typeof api.updateSimulation>[1]) => {
    setBusy(true);
    try {
      await api.updateSimulation(workflowId, body);
      push('success', `${label} — signal sent`);
      onChanged();
    } catch (error) {
      push('error', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <div className="card-header">
        <h2>Failure simulation</h2>
        {disabled && <span className="badge small tone-muted">workflow closed</span>}
      </div>

      <div className="grid two">
        <label className="field">
          <span>Transient failure stage</span>
          <select
            disabled={disabled || busy}
            value={simulation.transientFailureStage ?? ''}
            onChange={(event) =>
              patch('Transient failure updated', {
                transientFailureStage: (event.target.value || null) as StageId | null,
              })
            }
          >
            <option value="">none</option>
            {SIMULATABLE_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {titleCase(stage)}
              </option>
            ))}
          </select>
          <small>Fails {simulation.transientFailureAttempts} attempt(s), then succeeds.</small>
        </label>

        <label className="field">
          <span>Permanent failure stage</span>
          <select
            disabled={disabled || busy}
            value={simulation.permanentFailureStage ?? ''}
            onChange={(event) =>
              patch('Permanent failure updated', {
                permanentFailureStage: (event.target.value || null) as StageId | null,
              })
            }
          >
            <option value="">none</option>
            {SIMULATABLE_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {titleCase(stage)}
              </option>
            ))}
          </select>
          <small>Non-retryable: the workflow parks and waits for a recovery signal.</small>
        </label>

        <label className="field">
          <span>Slow service stage</span>
          <select
            disabled={disabled || busy}
            value={simulation.slowStage ?? ''}
            onChange={(event) =>
              patch('Slow service updated', {
                slowStage: (event.target.value || null) as StageId | null,
              })
            }
          >
            <option value="">none</option>
            {SIMULATABLE_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {titleCase(stage)}
              </option>
            ))}
          </select>
          <small>Adds a {(simulation.slowMs / 1000).toFixed(0)}s heartbeating delay.</small>
        </label>

        <div className="field">
          <span>Quick actions</span>
          <div className="button-row wrap">
            <button
              type="button"
              className="button small"
              disabled={disabled || busy}
              onClick={() =>
                patch('Transient failure armed', {
                  transientFailureStage: 'payment',
                  transientFailureAttempts: 2,
                })
              }
            >
              Break payment (transient)
            </button>
            <button
              type="button"
              className="button small"
              disabled={disabled || busy}
              onClick={() => patch('Permanent failure armed', { permanentFailureStage: 'payment' })}
            >
              Break payment (permanent)
            </button>
            <button
              type="button"
              className="button small ghost"
              disabled={disabled || busy}
              onClick={() =>
                patch('Simulation cleared', {
                  transientFailureStage: null,
                  permanentFailureStage: null,
                  slowStage: null,
                })
              }
            >
              Clear all faults
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
