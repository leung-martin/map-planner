import { useEffect, useRef, useState } from 'react';

type Props = {
  value: string;
  onCommit(value: string): void;
  multiline?: boolean;
  placeholder?: string;
  label: string;
  className?: string;
};

/** A text field that saves after a pause in typing, so each keystroke isn't a database write. */
export function LazyField({ value, onCommit, multiline, placeholder, label, className }: Props) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<number | undefined>(undefined);
  const focused = useRef(false);
  const pending = useRef<string | null>(null);
  const commit = useRef(onCommit);
  commit.current = onCommit;

  // Take in changes from the other device, unless the user is typing here.
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  const flush = () => {
    window.clearTimeout(timer.current);
    if (pending.current !== null) {
      commit.current(pending.current);
      pending.current = null;
    }
  };
  useEffect(() => flush, []);

  const props = {
    value: draft,
    placeholder,
    className,
    'aria-label': label,
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      flush();
    },
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setDraft(event.target.value);
      pending.current = event.target.value;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 600);
    },
  };
  return multiline ? <textarea rows={3} {...props} /> : <input {...props} />;
}
