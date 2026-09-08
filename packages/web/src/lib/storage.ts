/**
 * Browser-local persistence.
 *
 * IMPORTANT: localStorage only holds UI preferences and *references* to recently viewed claims.
 * Claim status, stages and progress are always re-fetched from Temporal through the API.
 */

const RECENT_KEY = 'claims-console.recent-claims.v1';
const PREFS_KEY = 'claims-console.preferences.v1';
const MAX_RECENT = 12;

export interface RecentClaimRef {
  workflowId: string;
  claimId: string;
  viewedAt: string;
}

export interface Preferences {
  pollIntervalMs: number;
  adjusterName: string;
  statusFilter: 'all' | 'open' | 'waiting' | 'closed';
  showHistory: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  pollIntervalMs: 2000,
  adjusterName: 'A. Adjuster',
  statusFilter: 'all',
  showHistory: false,
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return { ...fallback, ...(JSON.parse(raw) as T) };
  } catch {
    return fallback;
  }
}

export function loadPreferences(): Preferences {
  return readJson<Preferences>(PREFS_KEY, DEFAULT_PREFERENCES);
}

export function savePreferences(preferences: Preferences): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
  } catch {
    // storage disabled — preferences simply do not persist
  }
}

export function loadRecentClaims(): RecentClaimRef[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecentClaimRef[]) : [];
  } catch {
    return [];
  }
}

export function rememberClaim(ref: Omit<RecentClaimRef, 'viewedAt'>): RecentClaimRef[] {
  const next: RecentClaimRef[] = [
    { ...ref, viewedAt: new Date().toISOString() },
    ...loadRecentClaims().filter((entry) => entry.workflowId !== ref.workflowId),
  ].slice(0, MAX_RECENT);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function forgetClaim(workflowId: string): RecentClaimRef[] {
  const next = loadRecentClaims().filter((entry) => entry.workflowId !== workflowId);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function clearRecentClaims(): void {
  try {
    window.localStorage.removeItem(RECENT_KEY);
  } catch {
    // ignore
  }
}
