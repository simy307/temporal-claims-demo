import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { workerConfig } from './config';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('WorkerBootstrap');
  const app = await NestFactory.create(WorkerModule, { cors: true });
  app.enableShutdownHooks();
  await app.listen(workerConfig.adminPort);
  logger.log(
    `Worker admin API listening on http://localhost:${workerConfig.adminPort} (generation ${workerConfig.generation})`,
  );
}

bootstrap().catch((error) => {
  console.error('Worker failed to start', error);
  process.exit(1);
});
