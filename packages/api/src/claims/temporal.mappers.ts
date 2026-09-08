import { temporal } from '@temporalio/proto';
import type {
  HistoryEventSummary,
  PendingActivityInfo,
  WorkflowExecutionInfo,
  WorkflowStatusName,
} from '@claims/shared';

/** Protobuf timestamps arrive as `{ seconds, nanos }` (with Long-ish seconds). */
export function toIso(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  const candidate = value as { seconds?: unknown; nanos?: unknown };
  if (candidate.seconds !== undefined) {
    const seconds = Number(candidate.seconds);
    const nanos = Number(candidate.nanos ?? 0);
    if (Number.isFinite(seconds)) {
      return new Date(seconds * 1000 + nanos / 1e6).toISOString();
    }
  }
  return undefined;
}

export function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const STATUS_NAMES: WorkflowStatusName[] = [
  'UNKNOWN',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELED',
  'TERMINATED',
  'CONTINUED_AS_NEW',
  'TIMED_OUT',
];

/** The SDK and the protobufs spell some statuses differently (CANCELLED vs CANCELED). */
const STATUS_ALIASES: Record<string, WorkflowStatusName> = {
  UNSPECIFIED: 'UNKNOWN',
  UNKNOWN: 'UNKNOWN',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELED: 'CANCELED',
  CANCELLED: 'CANCELED',
  TERMINATED: 'TERMINATED',
  CONTINUED_AS_NEW: 'CONTINUED_AS_NEW',
  TIMED_OUT: 'TIMED_OUT',
};

function normalizeStatusName(name: string): WorkflowStatusName {
  const key = name.replace(/^WORKFLOW_EXECUTION_STATUS_/, '').toUpperCase();
  return STATUS_ALIASES[key] ?? 'UNKNOWN';
}

export function toStatusName(status: unknown): WorkflowStatusName {
  if (typeof status === 'string') {
    return normalizeStatusName(status);
  }
  if (typeof status === 'number') {
    return STATUS_NAMES[status] ?? 'UNKNOWN';
  }
  const record = status as { name?: string; code?: number } | undefined;
  if (record?.name) {
    return normalizeStatusName(record.name);
  }
  if (typeof record?.code === 'number') {
    return STATUS_NAMES[record.code] ?? 'UNKNOWN';
  }
  return 'UNKNOWN';
}

/** Reads a search attribute value regardless of the SDK representation used. */
export function readSearchAttribute(source: any, name: string): unknown {
  const typed = source?.typedSearchAttributes;
  if (typed) {
    try {
      const pairs = typeof typed.getAll === 'function' ? typed.getAll() : [];
      const match = pairs.find((pair: any) => pair?.key?.name === name);
      if (match) {
        return match.value;
      }
    } catch {
      // fall through to the legacy representation
    }
  }
  const legacy = source?.searchAttributes?.[name];
  if (Array.isArray(legacy)) {
    return legacy[0];
  }
  return legacy;
}

export function searchAttributesToRecord(source: any): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const typed = source?.typedSearchAttributes;
  if (typed && typeof typed.getAll === 'function') {
    for (const pair of typed.getAll()) {
      if (pair?.key?.name) {
        result[pair.key.name] = pair.value;
      }
    }
  }
  const legacy = source?.searchAttributes ?? {};
  for (const [key, value] of Object.entries(legacy)) {
    if (result[key] === undefined) {
      result[key] = Array.isArray(value) ? value[0] : value;
    }
  }
  return result;
}

export function toWorkflowExecutionInfo(description: any): WorkflowExecutionInfo {
  return {
    workflowId: description.workflowId,
    runId: description.runId,
    workflowType: typeof description.type === 'string' ? description.type : description.type?.name,
    taskQueue: description.taskQueue,
    status: toStatusName(description.status),
    startedAt: toIso(description.startTime),
    closedAt: toIso(description.closeTime),
    historyLength: toNumber(description.historyLength),
    searchAttributes: searchAttributesToRecord(description),
    memo: (description.memo ?? {}) as Record<string, unknown>,
  };
}

const ACTIVITY_STATES = ['UNSPECIFIED', 'SCHEDULED', 'STARTED', 'CANCEL_REQUESTED'];

/**
 * Maps Temporal's pending activity records, which is how the UI shows live activity retries
 * (attempt counter, last failure and the next scheduled retry).
 */
export function toPendingActivities(pending: any[] | undefined): PendingActivityInfo[] {
  if (!Array.isArray(pending)) {
    return [];
  }
  return pending.map((activity) => ({
    activityId: String(activity.activityId ?? ''),
    activityType: activity.activityType?.name ?? 'unknown',
    state:
      typeof activity.state === 'number'
        ? (ACTIVITY_STATES[activity.state] ?? String(activity.state))
        : String(activity.state ?? 'UNKNOWN'),
    attempt: toNumber(activity.attempt, 1),
    maximumAttempts: toNumber(activity.maximumAttempts),
    scheduledAt: toIso(activity.scheduledTime),
    lastStartedAt: toIso(activity.lastStartedTime),
    expirationAt: toIso(activity.expirationTime),
    lastFailure: activity.lastFailure?.message,
    heartbeatDetails: undefined,
  }));
}

const EVENT_TYPE_PATTERN = /^EVENT_TYPE_/;

/** Temporal returns numeric event-type codes; build a reverse lookup once. */
const EVENT_TYPE_NAMES: Record<number, string> = Object.entries(
  temporal.api.enums.v1.EventType as unknown as Record<string, number>,
).reduce<Record<number, string>>((map, [name, code]) => {
  if (typeof code === 'number') {
    map[code] = name.replace(EVENT_TYPE_PATTERN, '');
  }
  return map;
}, {});

export function toHistorySummary(events: any[] | undefined): HistoryEventSummary[] {
  if (!Array.isArray(events)) {
    return [];
  }
  return events.map((event) => {
    const rawType = event.eventType;
    const eventType =
      typeof rawType === 'number'
        ? (EVENT_TYPE_NAMES[rawType] ?? `UNKNOWN_${rawType}`)
        : typeof rawType === 'string'
          ? rawType.replace(EVENT_TYPE_PATTERN, '')
          : String(rawType);
    return {
      eventId: toNumber(event.eventId),
      eventTime: toIso(event.eventTime),
      eventType,
      details: describeEvent(event),
    };
  });
}

function describeEvent(event: any): string | undefined {
  const key = Object.keys(event).find(
    (candidate) => candidate.endsWith('EventAttributes') && event[candidate],
  );
  if (!key) {
    return undefined;
  }
  const attributes = event[key];
  const parts: string[] = [];
  if (attributes.activityType?.name) {
    parts.push(attributes.activityType.name);
  }
  if (attributes.workflowType?.name) {
    parts.push(attributes.workflowType.name);
  }
  if (attributes.signalName) {
    parts.push(`signal: ${attributes.signalName}`);
  }
  if (attributes.timerId) {
    parts.push(`timer ${attributes.timerId}`);
  }
  if (attributes.startToFireTimeout?.seconds !== undefined) {
    parts.push(`fires in ${Number(attributes.startToFireTimeout.seconds)}s`);
  }
  if (attributes.attempt && Number(attributes.attempt) > 1) {
    parts.push(`attempt ${Number(attributes.attempt)}`);
  }
  const failureMessage = attributes.failure?.message ?? attributes.lastFailure?.message;
  if (failureMessage) {
    parts.push(failureMessage);
  }
  if (attributes.searchAttributes?.indexedFields) {
    parts.push(
      `search attributes: ${Object.keys(attributes.searchAttributes.indexedFields).join(', ')}`,
    );
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}
