import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { APP } from '../../shared/config';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = useCallback((msg) => setToast(msg), []);
  const value = useMemo(() => ({ toast, showToast }), [toast, showToast]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

// Formatting lives in one place so currency/locale changes are a one-line config edit.
const fmt = new Intl.NumberFormat(APP.locale, { style: 'currency', currency: APP.currency });
export const money = (n) => fmt.format(n);

// Flight times are shown in the airport's own timezone, so callers pass `tz`.
export const formatWhen = (iso, tz = APP.timezone, opts = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) =>
  new Intl.DateTimeFormat(APP.locale, { timeZone: tz, ...opts }).format(new Date(iso));
export const formatTime = (iso, tz) => formatWhen(iso, tz, { hour: '2-digit', minute: '2-digit' });
export const formatDay = (iso, tz) => formatWhen(iso, tz, { weekday: 'short', day: 'numeric', month: 'short' });
export const formatDuration = (fromIso, toIso) => {
  const m = Math.round((new Date(toIso) - new Date(fromIso)) / 60000);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};
