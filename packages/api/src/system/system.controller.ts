import { Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import type { ApiConfigResponse, WorkerHealthResponse } from '@claims/shared';
import { apiConfig } from '../config';
import { TemporalService } from '../temporal/temporal.service';

/** Endpoints the dashboard uses for configuration, health and the worker-restart demo. */
@Controller('api/system')
export class SystemController {
  constructor(private readonly temporal: TemporalService) {}

  @Get('config')
  config(): ApiConfigResponse {
    return {
      taskQueue: apiConfig.taskQueue,
      namespace: apiConfig.namespace,
      temporalAddress: apiConfig.temporalAddress,
      temporalUiUrl: apiConfig.temporalUiUrl,
      workerAdminUrl: apiConfig.workerAdminUrl,
    };
  }

  @Get('health')
  async health() {
    let temporalReachable = true;
    let error: string | undefined;
    try {
      await this.temporal.client.workflowService.getSystemInfo({});
    } catch (caught) {
      temporalReachable = false;
      error = caught instanceof Error ? caught.message : String(caught);
    }
    return { status: temporalReachable ? 'ok' : 'degraded', temporalReachable, error };
  }

  @Get('worker')
  async workerHealth(): Promise<WorkerHealthResponse> {
    try {
      const response = await fetch(`${apiConfig.workerAdminUrl}/health`, {
        signal: AbortSignal.timeout(3_000),
      });
      if (!response.ok) {
        return { status: 'unreachable', error: `Worker responded with ${response.status}` };
      }
      const body = (await response.json()) as Record<string, unknown>;
      return { status: 'ok', ...body } as WorkerHealthResponse;
    } catch (error) {
      return {
        status: 'unreachable',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Restarts the worker process (demo control).
   * Running workflows are untouched — Temporal replays their histories on the new worker.
   */
  @Post('worker/restart')
  @HttpCode(202)
  async restartWorker(@Query('graceful') graceful?: string) {
    const response = await fetch(
      `${apiConfig.workerAdminUrl}/admin/restart?graceful=${graceful === 'true'}`,
      { method: 'POST', signal: AbortSignal.timeout(5_000) },
    );
    return response.json();
  }
}
