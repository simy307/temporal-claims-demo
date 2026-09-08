import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { apiConfig } from './config';

async function bootstrap(): Promise<void> {
  const logger = new Logger('ApiBootstrap');
  const app = await NestFactory.create(AppModule, { cors: true });
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  await app.listen(apiConfig.port);
  logger.log(`Claims API listening on http://localhost:${apiConfig.port}`);
  logger.log(`Temporal Web UI: ${apiConfig.temporalUiUrl}`);
}

bootstrap().catch((error) => {
  console.error('API failed to start', error);
  process.exit(1);
});
