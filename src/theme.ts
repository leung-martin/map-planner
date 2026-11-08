import { useSyncExternalStore } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';

// index.html repeats this lookup so the first paint is already in the right theme.
const KEY = 'mapplanner.theme';
const ORDER: ThemeChoice[] = ['system', 'light', 'dark'];
const media = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();

function readChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(KEY) as ThemeChoice | null;
    return saved && ORDER.includes(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

let choice = readChoice();

const resolved = () => (choice === 'system' ? (media.matches ? 'dark' : 'light') : choice);

function apply() {
  document.documentElement.dataset.theme = resolved();
  listeners.forEach((listener) => listener());
}

media.addEventListener('change', apply);
apply();

export function cycleTheme() {
  choice = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length];
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    // Without storage the choice still applies until the app is closed.
  }
  apply();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme() {
  const snapshot = useSyncExternalStore(subscribe, () => `${choice}:${resolved()}`);
  const [current, active] = snapshot.split(':') as [ThemeChoice, 'light' | 'dark'];
  return { choice: current, resolved: active };
}
