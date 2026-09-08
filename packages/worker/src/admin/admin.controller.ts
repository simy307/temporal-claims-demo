import { Controller, Get, Logger, Post, Query } from '@nestjs/common';
import { workerConfig } from '../config';
import { TemporalWorkerService } from '../temporal/temporal-worker.service';

/**
 * Small admin surface used by the dashboard's "restart worker" demo control.
 * The process exits with a magic code; `supervisor.mjs` starts a fresh worker.
 */
@Controller()
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly worker: TemporalWorkerService) {}

  @Get('health')
  health() {
    return this.worker.status();
  }

  @Post('admin/restart')
  restart(@Query('graceful') graceful?: string) {
    const isGraceful = graceful === 'true';
    this.logger.warn(
      `Restart requested (${isGraceful ? 'graceful' : 'abrupt'}) — the process will exit with code ${workerConfig.restartExitCode}`,
    );

    setTimeout(async () => {
      if (isGraceful) {
        await this.worker.onApplicationShutdown();
      }
      process.exit(workerConfig.restartExitCode);
    }, 150);

    return {
      status: 'restarting',
      graceful: isGraceful,
      workerId: this.worker.workerId,
      note: 'Running workflows are unaffected: Temporal replays their history on the new worker.',
    };
  }
}
