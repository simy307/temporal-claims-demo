import type { ClaimPhase, StageStatus, WorkflowStatusName } from '@claims/shared';
import { phaseLabel } from '@claims/shared';

const PHASE_TONE: Record<ClaimPhase, string> = {
  running: 'tone-active',
  'awaiting-review': 'tone-waiting',
  'awaiting-information': 'tone-waiting',
  'blocked-on-failure': 'tone-error',
  paying: 'tone-active',
  completed: 'tone-success',
  denied: 'tone-warning',
  cancelled: 'tone-muted',
  failed: 'tone-error',
};

const WORKFLOW_TONE: Record<WorkflowStatusName, string> = {
  RUNNING: 'tone-active',
  COMPLETED: 'tone-success',
  FAILED: 'tone-error',
  CANCELED: 'tone-muted',
  TERMINATED: 'tone-muted',
  CONTINUED_AS_NEW: 'tone-active',
  TIMED_OUT: 'tone-error',
  UNKNOWN: 'tone-muted',
};

const STAGE_TONE: Record<StageStatus, string> = {
  pending: 'tone-muted',
  active: 'tone-active',
  waiting: 'tone-waiting',
  completed: 'tone-success',
  failed: 'tone-error',
  skipped: 'tone-muted',
  cancelled: 'tone-muted',
};

export function PhaseBadge({ phase }: { phase: ClaimPhase }) {
  return <span className={`badge ${PHASE_TONE[phase] ?? 'tone-muted'}`}>{phaseLabel(phase)}</span>;
}

export function WorkflowBadge({ status }: { status: WorkflowStatusName }) {
  return (
    <span
      className={`badge ${WORKFLOW_TONE[status] ?? 'tone-muted'}`}
      title="Temporal workflow status"
    >
      {status}
    </span>
  );
}

export function StageBadge({ status }: { status: StageStatus }) {
  return <span className={`badge small ${STAGE_TONE[status]}`}>{status}</span>;
}
