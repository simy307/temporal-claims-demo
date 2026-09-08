import { Module } from '@nestjs/common';
import { ClaimsModule } from './claims/claims.module';
import { SystemModule } from './system/system.module';
import { TemporalModule } from './temporal/temporal.module';

@Module({
  imports: [TemporalModule, ClaimsModule, SystemModule],
})
export class AppModule {}
