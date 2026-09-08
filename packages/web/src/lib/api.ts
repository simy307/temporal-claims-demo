import type {
  AddNotePayload,
  ApiConfigResponse,
  ApprovePayload,
  ClaimDetailResponse,
  ClaimSummary,
  CreateClaimRequest,
  CreateClaimResponse,
  DenyPayload,
  HistoryEventSummary,
  ProvideInfoPayload,
  RecoverStagePayload,
  RequestInfoPayload,
  SimulationConfig,
  WorkerHealthResponse,
} from '@claims/shared';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      const detail = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
      if (detail) {
        message = detail;
      }
    } catch {
      // response had no JSON body
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

const post = <T>(path: string, body?: unknown): Promise<T> =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

/** Thin typed wrapper around the NestJS API. The UI never talks to Temporal directly. */
export const api = {
  config: () => request<ApiConfigResponse>('/api/system/config'),
  health: () =>
    request<{ status: string; temporalReachable: boolean; error?: string }>('/api/system/health'),
  worker: () => request<WorkerHealthResponse>('/api/system/worker'),
  restartWorker: (graceful = false) =>
    post<{ status: string; workerId?: string; note?: string }>(
      `/api/system/worker/restart?graceful=${graceful}`,
    ),

  listClaims: (limit = 100) => request<ClaimSummary[]>(`/api/claims?limit=${limit}`),
  getClaim: (workflowId: string) =>
    request<ClaimDetailResponse>(`/api/claims/${encodeURIComponent(workflowId)}`),
  getHistory: (workflowId: string, limit = 200) =>
    request<HistoryEventSummary[]>(
      `/api/claims/${encodeURIComponent(workflowId)}/history?limit=${limit}`,
    ),

  createClaim: (body: CreateClaimRequest) => post<CreateClaimResponse>('/api/claims', body),
  approve: (workflowId: string, body: ApprovePayload) =>
    post(`/api/claims/${encodeURIComponent(workflowId)}/approve`, body),
  deny: (workflowId: string, body: DenyPayload) =>
    post(`/api/claims/${encodeURIComponent(workflowId)}/deny`, body),
  requestInfo: (workflowId: string, body: RequestInfoPayload) =>
    post(`/api/claims/${encodeURIComponent(workflowId)}/request-info`, body),
  provideInfo: (workflowId: string, body: ProvideInfoPayload) =>
    post(`/api/claims/${encodeURIComponent(workflowId)}/provide-info`, body),
  recover: (workflowId: string, body: RecoverStagePayload) =>
    post(`/api/claims/${encodeURIComponent(workflowId)}/recover`, body),
  updateSimulation: (workflowId: string, body: Partial<SimulationConfig>) =>
    post(`/api/claims/${encodeURIComponent(workflowId)}/simulation`, body),
  addNote: (workflowId: string, body: AddNotePayload) =>
    post<{ noteCount: number }>(`/api/claims/${encodeURIComponent(workflowId)}/notes`, body),
  cancel: (workflowId: string) =>
    request(`/api/claims/${encodeURIComponent(workflowId)}`, { method: 'DELETE' }),
  terminate: (workflowId: string, reason: string) =>
    post(`/api/claims/${encodeURIComponent(workflowId)}/terminate`, { reason }),
};
