import { TASK_QUEUE } from '@claims/shared';

/** Runtime configuration for the worker process (env-var driven, no config files needed). */
export const workerConfig = {
  temporalAddress: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
  namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
  taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? TASK_QUEUE,
  adminPort: Number(process.env.WORKER_ADMIN_PORT ?? 3100),
  maxConcurrentActivityTaskExecutions: Number(process.env.WORKER_MAX_ACTIVITIES ?? 20),
  maxConcurrentWorkflowTaskExecutions: Number(process.env.WORKER_MAX_WORKFLOW_TASKS ?? 20),
  /** Incremented by supervisor.mjs every time the worker is restarted. */
  generation: Number(process.env.WORKER_GENERATION ?? 1),
  /** Exit code the supervisor interprets as "restart me". */
  restartExitCode: 17,
};
