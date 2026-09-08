import {
  computeProgress,
  createInitialStages,
  isWaitingOnHuman,
  phaseLabel,
  stageDefinition,
  stageIndex,
  STAGE_IDS,
} from '@claims/shared';

describe('claim stage model', () => {
  it('creates one pending stage per lifecycle step', () => {
    const stages = createInitialStages();
    expect(stages).toHaveLength(STAGE_IDS.length);
    expect(stages.every((stage) => stage.status === 'pending')).toBe(true);
    expect(stages.map((stage) => stage.id)).toEqual(STAGE_IDS);
  });

  it('orders the lifecycle from submission to completion', () => {
    expect(stageIndex('submitted')).toBe(0);
    expect(stageIndex('human-review')).toBeGreaterThan(stageIndex('fraud-evaluation'));
    expect(stageIndex('payment')).toBeGreaterThan(stageIndex('decision'));
    expect(stageIndex('completed')).toBe(STAGE_IDS.length - 1);
  });

  it('throws for unknown stages', () => {
    expect(() => stageDefinition('nope' as never)).toThrow(/Unknown stage/);
  });
});

describe('computeProgress', () => {
  it('reports 0% for a brand new claim', () => {
    expect(computeProgress(createInitialStages())).toBe(0);
  });

  it('reports 100% when every stage is completed or skipped', () => {
    const stages = createInitialStages().map((stage, index) => ({
      ...stage,
      status: index % 2 === 0 ? ('completed' as const) : ('skipped' as const),
    }));
    expect(computeProgress(stages)).toBe(100);
  });

  it('counts an active or waiting stage as half done', () => {
    const stages = createInitialStages();
    stages[0].status = 'completed';
    const withCompletedOnly = computeProgress(stages);

    stages[1].status = 'active';
    const withActiveStage = computeProgress(stages);
    expect(withActiveStage).toBeGreaterThan(withCompletedOnly);

    stages[1].status = 'waiting';
    expect(computeProgress(stages)).toBe(withActiveStage);
  });

  it('never counts failed or pending stages', () => {
    const stages = createInitialStages();
    stages[0].status = 'completed';
    const baseline = computeProgress(stages);
    stages[1].status = 'failed';
    expect(computeProgress(stages)).toBe(baseline);
  });

  it('increases monotonically as the claim advances', () => {
    const stages = createInitialStages();
    let previous = computeProgress(stages);
    for (const stage of stages) {
      stage.status = 'completed';
      const current = computeProgress(stages);
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
    expect(previous).toBe(100);
  });
});

describe('phase helpers', () => {
  it('labels every phase', () => {
    expect(phaseLabel('awaiting-review')).toBe('Waiting for adjuster');
    expect(phaseLabel('blocked-on-failure')).toBe('Blocked on failure');
  });

  it('knows which phases need a human', () => {
    expect(isWaitingOnHuman('awaiting-review')).toBe(true);
    expect(isWaitingOnHuman('awaiting-information')).toBe(true);
    expect(isWaitingOnHuman('blocked-on-failure')).toBe(true);
    expect(isWaitingOnHuman('running')).toBe(false);
    expect(isWaitingOnHuman('completed')).toBe(false);
  });
});
