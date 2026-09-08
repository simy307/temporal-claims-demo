import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  STAGE_IDS,
  type ClaimType,
  type CreateClaimRequest,
  type StageId,
  type SimulationConfig,
} from '@claims/shared';

const CLAIM_TYPES: ClaimType[] = ['auto', 'home', 'health', 'travel'];

export class SimulationDto implements Partial<SimulationConfig> {
  @IsOptional()
  @IsIn([...STAGE_IDS, null])
  transientFailureStage?: StageId | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  transientFailureAttempts?: number;

  @IsOptional()
  @IsIn([...STAGE_IDS, null])
  permanentFailureStage?: StageId | null;

  @IsOptional()
  @IsIn([...STAGE_IDS, null])
  slowStage?: StageId | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(300_000)
  slowMs?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  forceFraudScore?: number | null;
}

export class CreateClaimDto implements CreateClaimRequest {
  @IsString()
  @MinLength(4)
  @MaxLength(40)
  policyNumber!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  policyholder!: string;

  @IsIn(CLAIM_TYPES)
  claimType!: ClaimType;

  @IsString()
  @MinLength(4)
  incidentDate!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(1_000)
  description!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SimulationDto)
  simulation?: SimulationDto;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3_600)
  paymentHoldSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(3_600)
  reviewReminderSeconds?: number;
}

export class ApproveDto {
  @IsString()
  @MinLength(2)
  adjuster!: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  approvedAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class DenyDto {
  @IsString()
  @MinLength(2)
  adjuster!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class RequestInfoDto {
  @IsString()
  @MinLength(2)
  adjuster!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  question!: string;
}

export class ProvideInfoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1_000)
  answer!: string;

  @IsString()
  @MinLength(2)
  submittedBy!: string;
}

export class RecoverStageDto {
  @IsIn(['retry', 'abandon'])
  action!: 'retry' | 'abandon';

  @IsOptional()
  @IsBoolean()
  clearSimulation?: boolean;

  @IsString()
  @MinLength(2)
  requestedBy!: string;
}

export class AddNoteDto {
  @IsString()
  @MinLength(2)
  author!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  note!: string;
}

export class CancelDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class ListClaimsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  query?: string;
}

export class BulkClaimIdsDto {
  @IsArray()
  @IsString({ each: true })
  workflowIds!: string[];
}
