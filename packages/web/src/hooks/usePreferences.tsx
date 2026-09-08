import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  type Preferences,
} from '../lib/storage';

interface PreferencesContextValue {
  preferences: Preferences;
  update: (patch: Partial<Preferences>) => void;
  reset: () => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

/** UI preferences persisted in localStorage (never workflow state). */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(() => loadPreferences());

  useEffect(() => {
    savePreferences(preferences);
  }, [preferences]);

  const update = useCallback((patch: Partial<Preferences>) => {
    setPreferences((current) => ({ ...current, ...patch }));
  }, []);

  const reset = useCallback(() => setPreferences(DEFAULT_PREFERENCES), []);

  const value = useMemo(() => ({ preferences, update, reset }), [preferences, update, reset]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used inside a PreferencesProvider');
  }
  return context;
}
