import { Link, Outlet, useLocation } from 'react-router-dom';
import { usePolling } from './hooks/usePolling';
import { PreferencesProvider, usePreferences } from './hooks/usePreferences';
import { ToastProvider, ToastStack } from './hooks/useToasts';
import { api } from './lib/api';

const POLL_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '1s', value: 1000 },
  { label: '2s', value: 2000 },
  { label: '5s', value: 5000 },
  { label: '10s', value: 10000 },
];

function Header() {
  const { preferences, update } = usePreferences();
  const location = useLocation();
  const config = usePolling(() => api.config(), 60_000);
  const health = usePolling(() => api.health(), 10_000);
  const worker = usePolling(() => api.worker(), 5_000);

  const temporalUiUrl = config.data?.temporalUiUrl ?? 'http://localhost:8233';

  return (
    <header className="app-header">
      <div className="brand">
        <Link to="/" className="brand-link">
          <span className="brand-mark">◈</span>
          <span>
            <strong>Claims Console</strong>
            <small>Durable insurance claim processing on Temporal</small>
          </span>
        </Link>
      </div>

      <div className="header-controls">
        <label className="field inline">
          <span>Adjuster</span>
          <input
            value={preferences.adjusterName}
            onChange={(event) => update({ adjusterName: event.target.value })}
            placeholder="Your name"
          />
        </label>

        <label className="field inline">
          <span>Refresh</span>
          <select
            value={preferences.pollIntervalMs}
            onChange={(event) => update({ pollIntervalMs: Number(event.target.value) })}
          >
            {POLL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="status-chips">
          <span
            className={`chip ${health.data?.temporalReachable ? 'chip-ok' : 'chip-bad'}`}
            title={health.data?.error ?? 'Temporal server connectivity'}
          >
            Temporal {health.data?.temporalReachable ? 'up' : 'down'}
          </span>
          <span
            className={`chip ${worker.data?.status === 'ok' ? 'chip-ok' : 'chip-bad'}`}
            title={worker.data?.error ?? worker.data?.workerId ?? 'Worker connectivity'}
          >
            Worker{' '}
            {worker.data?.status === 'ok' ? `up · ${worker.data.restarts ?? 0} restarts` : 'down'}
          </span>
          <a className="chip chip-link" href={temporalUiUrl} target="_blank" rel="noreferrer">
            Temporal Web UI ↗
          </a>
        </div>

        {location.pathname !== '/' && (
          <Link className="button ghost" to="/">
            ← All claims
          </Link>
        )}
      </div>
    </header>
  );
}

export function App() {
  return (
    <PreferencesProvider>
      <ToastProvider>
        <div className="app-shell">
          <Header />
          <main className="app-main">
            <Outlet />
          </main>
          <footer className="app-footer">
            Temporal is the source of truth for every claim. The browser only remembers your
            preferences and the claims you recently opened.
          </footer>
          <ToastStack />
        </div>
      </ToastProvider>
    </PreferencesProvider>
  );
}
