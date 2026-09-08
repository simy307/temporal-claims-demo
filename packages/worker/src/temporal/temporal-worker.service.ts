import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from '../activities';
import { workerConfig } from '../config';

/**
 * Owns the Temporal worker lifecycle.
 *
 * The worker is the only component that executes workflow and activity code; the API never does.
 * Restarting this process (see AdminController) is safe at any time: Temporal replays the
 * workflow history on the new worker and running claims continue where they left off.
 */
@Injectable()
export class TemporalWorkerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(TemporalWorkerService.name);
  private connection?: NativeConnection;
  private worker?: Worker;
  private runPromise?: Promise<void>;

  readonly workerId = `worker-${process.pid}-gen${workerConfig.generation}`;
  readonly startedAt = new Date().toISOString();

  async onModuleInit(): Promise<void> {
    this.connection = await this.connectWithRetry();

    this.worker = await Worker.create({
      connection: this.connection,
      namespace: workerConfig.namespace,
      taskQueue: workerConfig.taskQueue,
      // Dev-friendly: bundles the workflow code at startup. Use `workflowBundle` in production.
      workflowsPath: require.resolve('../workflows'),
      activities,
      maxConcurrentActivityTaskExecutions: workerConfig.maxConcurrentActivityTaskExecutions,
      maxConcurrentWorkflowTaskExecutions: workerConfig.maxConcurrentWorkflowTaskExecutions,
      identity: this.workerId,
    });

    this.logger.log(
      `Temporal worker ${this.workerId} polling task queue "${workerConfig.taskQueue}" at ${workerConfig.temporalAddress}`,
    );

    this.runPromise = this.worker.run().catch((error) => {
      this.logger.error(`Temporal worker stopped unexpectedly: ${error}`);
      process.exit(1);
    });
  }

  async onApplicationShutdown(): Promise<void> {
    try {
      this.worker?.shutdown();
      await this.runPromise;
    } catch (error) {
      this.logger.warn(`Error while shutting down the worker: ${error}`);
    }
    await this.connection?.close().catch(() => undefined);
  }

  status() {
    return {
      status: 'ok' as const,
      workerId: this.workerId,
      startedAt: this.startedAt,
      restarts: workerConfig.generation - 1,
      taskQueue: workerConfig.taskQueue,
      namespace: workerConfig.namespace,
      temporalAddress: workerConfig.temporalAddress,
      state: this.worker?.getState() ?? 'INITIALIZED',
    };
  }

  /** The dev server may still be booting when the worker starts, so retry for a while. */
  private async connectWithRetry(attempts = 30, delayMs = 2_000): Promise<NativeConnection> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await NativeConnection.connect({ address: workerConfig.temporalAddress });
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `Temporal not reachable at ${workerConfig.temporalAddress} (attempt ${attempt}/${attempts}) — retrying`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw new Error(
      `Unable to connect to Temporal at ${workerConfig.temporalAddress}: ${lastError}`,
    );
  }
}
