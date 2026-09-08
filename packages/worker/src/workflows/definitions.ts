/**
 * Signal / query / update definitions.
 *
 * They live in their own module so both the workflow implementation and (potentially) any typed
 * client can share them. The API deliberately addresses them by name via `@claims/shared`, so it
 * never has to import workflow code.
 */
import { defineQuery, defineSignal, defineUpdate } from '@temporalio/workflow';
import {
  QUERIES,
  SIGNALS,
  UPDATES,
  type AddNotePayload,
  type ApprovePayload,
  type ClaimState,
  type DenyPayload,
  type ProvideInfoPayload,
  type RecoverStagePayload,
  type RequestInfoPayload,
  type SimulationConfig,
} from '@claims/shared';

export const approveSignal = defineSignal<[ApprovePayload]>(SIGNALS.approve);
export const denySignal = defineSignal<[DenyPayload]>(SIGNALS.deny);
export const requestInfoSignal = defineSignal<[RequestInfoPayload]>(SIGNALS.requestInfo);
export const provideInfoSignal = defineSignal<[ProvideInfoPayload]>(SIGNALS.provideInfo);
export const recoverStageSignal = defineSignal<[RecoverStagePayload]>(SIGNALS.recoverStage);
export const updateSimulationSignal = defineSignal<[Partial<SimulationConfig>]>(
  SIGNALS.updateSimulation,
);

export const claimStateQuery = defineQuery<ClaimState>(QUERIES.claimState);
export const progressQuery = defineQuery<number>(QUERIES.progress);
export const fraudProgressQuery = defineQuery<string>(QUERIES.fraudProgress);

export const addNoteUpdate = defineUpdate<number, [AddNotePayload]>(UPDATES.addNote);
