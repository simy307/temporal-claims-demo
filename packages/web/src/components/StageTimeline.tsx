import { STAGE_DEFINITIONS, type ClaimState, type StageState } from '@claims/shared';
import { formatTime } from '../lib/format';
import { StageBadge } from './Badges';

const ICONS: Record<StageState['status'], string> = {
  pending: '○',
  active: '◐',
  waiting: '⏸',
  completed: '●',
  failed: '✕',
  skipped: '⊘',
  cancelled: '⊗',
};

/**
 * Vertical timeline of the claim lifecycle: completed, active, waiting, failed and upcoming
 * stages, exactly as reported by the workflow's `getClaimState` query.
 */
export function StageTimeline({ state }: { state: ClaimState }) {
  return (
    <ol className="timeline">
      {state.stages.map((stage) => {
        const definition = STAGE_DEFINITIONS.find((item) => item.id === stage.id);
        const isCurrent = state.currentStage === stage.id;
        return (
          <li
            key={stage.id}
            className={`timeline-item status-${stage.status} ${isCurrent ? 'is-current' : ''}`}
          >
            <div className="timeline-marker" aria-hidden>
              {ICONS[stage.status]}
            </div>
            <div className="timeline-body">
              <div className="timeline-heading">
                <strong>{stage.name}</strong>
                <StageBadge status={stage.status} />
                {stage.runs > 1 && <span className="pill">run {stage.runs}</span>}
              </div>
              <p className="timeline-detail">{stage.detail ?? definition?.description}</p>
              <div className="timeline-meta">
                {stage.startedAt && <span>started {formatTime(stage.startedAt)}</span>}
                {stage.completedAt && <span>ended {formatTime(stage.completedAt)}</span>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
