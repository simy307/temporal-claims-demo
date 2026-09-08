import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type {
  ClaimDetailResponse,
  ClaimSummary,
  CreateClaimResponse,
  HistoryEventSummary,
} from '@claims/shared';
import { ClaimsService } from './claims.service';
import {
  AddNoteDto,
  ApproveDto,
  CancelDto,
  CreateClaimDto,
  DenyDto,
  ListClaimsQueryDto,
  ProvideInfoDto,
  RecoverStageDto,
  RequestInfoDto,
  SimulationDto,
} from './dto';

/**
 * REST facade over Temporal.
 *
 * Reads go through workflow queries / visibility APIs, writes go through signals, updates and
 * client commands. The API keeps no state of its own.
 */
@Controller('api/claims')
export class ClaimsController {
  constructor(private readonly claims: ClaimsService) {}

  @Post()
  createClaim(@Body() body: CreateClaimDto): Promise<CreateClaimResponse> {
    return this.claims.createClaim(body);
  }

  @Get()
  listClaims(@Query() query: ListClaimsQueryDto): Promise<ClaimSummary[]> {
    return this.claims.listClaims(query.limit ?? 50, query.query);
  }

  @Get(':workflowId')
  getClaim(@Param('workflowId') workflowId: string): Promise<ClaimDetailResponse> {
    return this.claims.getClaim(workflowId);
  }

  @Get(':workflowId/progress')
  getProgress(@Param('workflowId') workflowId: string): Promise<{ progress: number }> {
    return this.claims.getProgress(workflowId);
  }

  @Get(':workflowId/history')
  getHistory(
    @Param('workflowId') workflowId: string,
    @Query('limit') limit?: string,
  ): Promise<HistoryEventSummary[]> {
    return this.claims.getHistory(workflowId, limit ? Number(limit) : 200);
  }

  @Post(':workflowId/approve')
  @HttpCode(202)
  async approve(@Param('workflowId') workflowId: string, @Body() body: ApproveDto) {
    await this.claims.approve(workflowId, body);
    return { status: 'signal-sent', signal: 'approveClaim' };
  }

  @Post(':workflowId/deny')
  @HttpCode(202)
  async deny(@Param('workflowId') workflowId: string, @Body() body: DenyDto) {
    await this.claims.deny(workflowId, body);
    return { status: 'signal-sent', signal: 'denyClaim' };
  }

  @Post(':workflowId/request-info')
  @HttpCode(202)
  async requestInfo(@Param('workflowId') workflowId: string, @Body() body: RequestInfoDto) {
    await this.claims.requestInformation(workflowId, body);
    return { status: 'signal-sent', signal: 'requestMoreInformation' };
  }

  @Post(':workflowId/provide-info')
  @HttpCode(202)
  async provideInfo(@Param('workflowId') workflowId: string, @Body() body: ProvideInfoDto) {
    await this.claims.provideInformation(workflowId, body);
    return { status: 'signal-sent', signal: 'provideInformation' };
  }

  @Post(':workflowId/recover')
  @HttpCode(202)
  async recover(@Param('workflowId') workflowId: string, @Body() body: RecoverStageDto) {
    await this.claims.recoverStage(workflowId, {
      action: body.action,
      clearSimulation: body.clearSimulation ?? true,
      requestedBy: body.requestedBy,
    });
    return { status: 'signal-sent', signal: 'recoverStage' };
  }

  @Post(':workflowId/simulation')
  @HttpCode(202)
  async updateSimulation(@Param('workflowId') workflowId: string, @Body() body: SimulationDto) {
    await this.claims.updateSimulation(workflowId, body);
    return { status: 'signal-sent', signal: 'updateSimulation' };
  }

  @Post(':workflowId/notes')
  async addNote(@Param('workflowId') workflowId: string, @Body() body: AddNoteDto) {
    return this.claims.addNote(workflowId, body);
  }

  @Delete(':workflowId')
  @HttpCode(202)
  async cancel(@Param('workflowId') workflowId: string) {
    await this.claims.cancel(workflowId);
    return { status: 'cancellation-requested' };
  }

  @Post(':workflowId/terminate')
  @HttpCode(202)
  async terminate(@Param('workflowId') workflowId: string, @Body() body: CancelDto) {
    await this.claims.terminate(workflowId, body?.reason);
    return { status: 'terminated' };
  }
}
