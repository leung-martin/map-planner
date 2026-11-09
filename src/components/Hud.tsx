import { Moon, Settings, Sun, SunMoon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cycleTheme, useTheme } from '../theme';

const THEME_LABEL = { system: 'Auto', light: 'Light', dark: 'Dark' };
const THEME_ICON = { system: SunMoon, light: Sun, dark: Moon };

export function ThemeToggle() {
  const { choice } = useTheme();
  const Icon = THEME_ICON[choice];
  return (
    <button className="theme-toggle" onClick={cycleTheme} title="Change theme" aria-label={`Theme: ${THEME_LABEL[choice]}. Change theme`}>
      <Icon size={18} aria-hidden="true" /> <b>{THEME_LABEL[choice]}</b>
    </button>
  );
}

export function MapsLink({ href, name }: { href: string; name: string }) {
  return (
    <a className="maps-link" href={href} target="_blank" rel="noreferrer" title="Open in Google Maps" aria-label={`Open ${name} in Google Maps`}>
      <svg viewBox="0 0 92.3 132.3" width="17" height="24" aria-hidden="true">
        <path fill="#1a73e8" d="M60.2 2.2C55.8.8 51 0 46.1 0 32 0 19.3 6.4 10.8 16.5l21.8 18.3L60.2 2.2z" />
        <path fill="#ea4335" d="M10.8 16.5C4.1 24.5 0 34.9 0 46.1c0 8.7 1.7 15.7 4.6 22l28-33.3-21.8-18.3z" />
        <path fill="#4285f4" d="M46.2 28.5c9.8 0 17.7 7.9 17.7 17.7 0 4.3-1.6 8.3-4.2 11.4 0 0 13.9-16.6 27.5-32.7-5.6-10.8-15.3-19-27-22.7L32.6 34.8c3.3-3.8 8.1-6.3 13.6-6.3" />
        <path fill="#fbbc04" d="M46.2 63.8c-9.8 0-17.7-7.9-17.7-17.7 0-4.3 1.5-8.3 4.1-11.3l-28 33.3c4.8 10.6 12.8 19.2 21 29.9l34.1-40.5c-3.3 3.9-8.1 6.3-13.5 6.3" />
        <path fill="#34a853" d="M59.1 109.2c15.4-24.1 33.3-35 33.3-63 0-7.7-1.9-14.9-5.2-21.3L25.6 98c2.6 3.4 5.3 7.3 7.9 11.3 9.4 14.5 6.8 23.1 12.8 23.1s3.4-8.7 12.8-23.2" />
      </svg>
    </a>
  );
}

/** A gear button that opens a small menu. Children get a function that closes it. */
export function SettingsMenu({ children }: { children(close: () => void): ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="settings" ref={root}>
      <button className="icon-button" title="Settings" aria-label="Settings" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        <Settings size={20} aria-hidden="true" />
      </button>
      {open && <div className="settings-menu" role="menu">{children(() => setOpen(false))}</div>}
    </div>
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
