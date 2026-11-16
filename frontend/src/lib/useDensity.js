import { useEffect, useState } from 'react';

// How tightly a person likes their work grids: 'compact' (32px rows, the
// default — more of the list on screen) or 'comfortable' (40px). A preference
// of the person at this browser, so it lives in localStorage; every grid on the
// page follows a change at once.
const KEY = 'tig.density';
const EVENT = 'tig:density';
export const DENSITIES = ['compact', 'comfortable'];

function read() {
  try {
    const value = localStorage.getItem(KEY);
    return DENSITIES.includes(value) ? value : 'compact';
  } catch {
    return 'compact';
  }
}

export function useDensity() {
  const [density, setLocal] = useState(read);

  useEffect(() => {
    const sync = () => setLocal(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setDensity = (value) => {
    if (!DENSITIES.includes(value)) return;
    try { localStorage.setItem(KEY, value); } catch { /* storage blocked — this page only */ }
    setLocal(value);
    window.dispatchEvent(new Event(EVENT));
  };

  return [density, setDensity];
}
