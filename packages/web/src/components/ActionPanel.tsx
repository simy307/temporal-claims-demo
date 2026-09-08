import { useState } from 'react';
import type { ClaimState } from '@claims/shared';
import { api } from '../lib/api';
import { useToasts } from '../hooks/useToasts';
import { formatDateTime, formatMoney } from '../lib/format';

interface Props {
  workflowId: string;
  state: ClaimState;
  adjuster: string;
  onChanged: () => void;
}

/**
 * The human-in-the-loop control surface. Every button here sends a Temporal *signal*; the
 * workflow is literally parked on `condition(...)` until one of them arrives.
 */
export function ActionPanel({ workflowId, state, adjuster, onChanged }: Props) {
  const { push } = useToasts();
  const [busy, setBusy] = useState<string | null>(null);
  const [approvedAmount, setApprovedAmount] = useState<string>(
    String(state.assessment?.estimatedRepairCost ?? state.input.amount),
  );
  const [notes, setNotes] = useState('');
  const [denyReason, setDenyReason] = useState('');
  const [question, setQuestion] = useState('Please upload the police report or repair invoice.');
  const [answer, setAnswer] = useState('');

  const send = async (label: string, action: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await action();
      push('success', `${label} sent to workflow`);
      onChanged();
    } catch (error) {
      push('error', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const awaiting = state.awaiting;

  if (awaiting.kind === 'failure-recovery') {
    return (
      <section className="card highlight-error">
        <div className="card-header">
          <h2>⚠ Workflow blocked — waiting for a decision</h2>
        </div>
        <p>
          Stage <strong>{awaiting.stage}</strong> failed after {awaiting.attempts} run(s) and the
          workflow is parked waiting for a <code>recoverStage</code> signal.
        </p>
        <pre className="error-box">{awaiting.error}</pre>
        <p className="muted">Blocked since {formatDateTime(awaiting.since)}</p>
        <div className="button-row">
          <button
            type="button"
            className="button primary"
            disabled={busy !== null}
            onClick={() =>
              send('Retry (clear simulation)', () =>
                api.recover(workflowId, {
                  action: 'retry',
                  clearSimulation: true,
                  requestedBy: adjuster,
                }),
              )
            }
          >
            Retry stage &amp; clear the simulated fault
          </button>
          <button
            type="button"
            className="button"
            disabled={busy !== null}
            onClick={() =>
              send('Retry as-is', () =>
                api.recover(workflowId, {
                  action: 'retry',
                  clearSimulation: false,
                  requestedBy: adjuster,
                }),
              )
            }
          >
            Retry as-is (will fail again)
          </button>
          <button
            type="button"
            className="button danger"
            disabled={busy !== null}
            onClick={() =>
              send('Abandon', () =>
                api.recover(workflowId, {
                  action: 'abandon',
                  clearSimulation: false,
                  requestedBy: adjuster,
                }),
              )
            }
          >
            Abandon claim (fail the workflow)
          </button>
        </div>
      </section>
    );
  }

  if (awaiting.kind === 'none') {
    return (
      <section className="card">
        <div className="card-header">
          <h2>Adjuster actions</h2>
        </div>
        <p className="empty">
          The workflow is not waiting for human input right now
          {state.phase === 'running' || state.phase === 'paying'
            ? ' — it is busy running activities.'
            : '.'}
        </p>
      </section>
    );
  }

  return (
    <section className="card highlight-waiting">
      <div className="card-header">
        <h2>
          {awaiting.kind === 'human-review'
            ? '⏸ Waiting for your decision'
            : '⏸ Waiting for more information'}
        </h2>
      </div>

      {awaiting.kind === 'human-review' && (
        <p className="muted">
          Waiting since {formatDateTime(awaiting.since)} · {awaiting.remindersSent} reminder
          timer(s) fired. The workflow waits indefinitely.
        </p>
      )}

      {awaiting.kind === 'more-information' && (
        <>
          <p>
            <strong>{awaiting.requestedBy}</strong> asked: “{awaiting.question}”
          </p>
          <div className="grid two">
            <label className="field">
              <span>Answer</span>
              <textarea
                rows={2}
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
              />
            </label>
            <div className="field align-end">
              <button
                type="button"
                className="button primary"
                disabled={busy !== null || answer.trim().length === 0}
                onClick={() =>
                  send('Information', () =>
                    api.provideInfo(workflowId, { answer, submittedBy: state.input.policyholder }),
                  ).then(() => setAnswer(''))
                }
              >
                Provide information
              </button>
            </div>
          </div>
          <hr className="divider" />
        </>
      )}

      <div className="grid two">
        <div className="action-block">
          <h3>Approve</h3>
          <label className="field">
            <span>Approved amount</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={approvedAmount}
              onChange={(event) => setApprovedAmount(event.target.value)}
            />
            <small>
              Estimate: {formatMoney(state.assessment?.estimatedRepairCost)} · claimed{' '}
              {formatMoney(state.input.amount)}
            </small>
          </label>
          <label className="field">
            <span>Notes (optional)</span>
            <input value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <button
            type="button"
            className="button success"
            disabled={busy !== null}
            onClick={() =>
              send('Approval', () =>
                api.approve(workflowId, {
                  adjuster,
                  approvedAmount: Number(approvedAmount),
                  notes: notes || undefined,
                }),
              )
            }
          >
            Approve claim
          </button>
        </div>

        <div className="action-block">
          <h3>Deny</h3>
          <label className="field">
            <span>Reason</span>
            <input
              value={denyReason}
              onChange={(event) => setDenyReason(event.target.value)}
              placeholder="Damage predates the policy"
            />
          </label>
          <button
            type="button"
            className="button danger"
            disabled={busy !== null || denyReason.trim().length < 3}
            onClick={() =>
              send('Denial', () => api.deny(workflowId, { adjuster, reason: denyReason }))
            }
          >
            Deny claim
          </button>

          {awaiting.kind === 'human-review' && (
            <>
              <h3 className="spaced">Request information</h3>
              <label className="field">
                <span>Question for the claimant</span>
                <input value={question} onChange={(event) => setQuestion(event.target.value)} />
              </label>
              <button
                type="button"
                className="button"
                disabled={busy !== null || question.trim().length < 3}
                onClick={() =>
                  send('Information request', () =>
                    api.requestInfo(workflowId, { adjuster, question }),
                  )
                }
              >
                Request more info
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
