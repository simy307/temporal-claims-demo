import { Module } from '@nestjs/common';
import { AdminController } from './admin/admin.controller';
import { TemporalWorkerService } from './temporal/temporal-worker.service';

@Module({
  controllers: [AdminController],
  providers: [TemporalWorkerService],
})
export class WorkerModule {}
