import { useEffect, type ReactNode } from 'react';
import { cycleTheme, useTheme } from '../theme';

const THEME_LABEL = { system: 'Auto', light: 'Light', dark: 'Dark' };

export function ThemeToggle() {
  const { choice } = useTheme();
  return (
    <button className="theme-toggle" onClick={cycleTheme} aria-label={`Theme: ${THEME_LABEL[choice]}. Change theme`}>
      Theme <b>{THEME_LABEL[choice]}</b>
    </button>
  );
}

export function StatusLine({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="status-line">
      <span className="status-ring" aria-hidden="true" />
      <span className="grow clip">{children}</span>
      {aside}
    </div>
  );
}

export type KeyHint = { key: string; label: string; run?: () => void };

/** The strip of shortcuts under a panel. Hints with an action are also buttons, for touch screens. */
export function KeyHints({ hints }: { hints: KeyHint[] }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches('input, textarea, select') || event.ctrlKey || event.metaKey || event.altKey) return;
      hints.find((hint) => hint.run && hint.key.toLowerCase() === event.key.toLowerCase())?.run?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="key-hints">
      {hints.map((hint) =>
        hint.run ? (
          <button key={hint.key} className="key-hint" onClick={hint.run}>
            <kbd>{hint.key}</kbd> {hint.label}
          </button>
        ) : (
          <span key={hint.key} className="key-hint">
            <kbd>{hint.key}</kbd> {hint.label}
          </span>
        ),
      )}
    </div>
  );
}
