import { TASK_QUEUE } from '@claims/shared';

export const apiConfig = {
  port: Number(process.env.API_PORT ?? 3000),
  temporalAddress: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
  namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
  taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? TASK_QUEUE,
  temporalUiUrl: process.env.TEMPORAL_UI_URL ?? 'http://localhost:8233',
  workerAdminUrl: process.env.WORKER_ADMIN_URL ?? 'http://localhost:3100',
  /** How long a claim workflow may run before Temporal times it out. */
  workflowExecutionTimeout: process.env.WORKFLOW_EXECUTION_TIMEOUT ?? '7 days',
};
