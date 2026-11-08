import { useEffect, useRef, useState } from 'react';
import type { Suggestion } from '../maps/provider';

type Props = {
  placeholder: string;
  autoFocus?: boolean;
  search(query: string): Promise<Suggestion[]>;
  onPick(suggestion: Suggestion): void;
  /** Enter pressed with nothing typed. */
  onEmptyEnter?(): void;
};

export function SearchBox({ placeholder, autoFocus, search, onPick, onEmptyEnter }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');
  const searchRef = useRef(search);
  searchRef.current = search;

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setStatus('');
      return;
    }
    let stale = false;
    const timer = window.setTimeout(() => {
      searchRef
        .current(query)
        .then((found) => {
          if (stale) return;
          setResults(found);
          setActive(0);
          setStatus(found.length ? '' : 'No matches');
        })
        .catch(() => {
          if (!stale) setStatus('Search isn’t available right now');
        });
    }, 250);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const pick = (suggestion: Suggestion) => {
    setQuery('');
    setResults([]);
    setOpen(false);
    onPick(suggestion);
  };

  const showList = open && (results.length > 0 || status !== '');

  return (
    <div className="search">
      <input
        type="search"
        value={query}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (event.key === 'Enter' && results[active]) {
            event.preventDefault();
            pick(results[active]);
          } else if (event.key === 'Enter' && query.trim() === '') {
            onEmptyEnter?.();
          } else if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {showList && (
        <ul className="search-results">
          {status && <li className="muted search-status">{status}</li>}
          {results.map((result, index) => (
            <li key={result.placeId}>
              <button
                className={index === active ? 'active' : ''}
                // Keeps focus in the input so its blur doesn't close the list before the tap lands.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(result)}
              >
                <strong>{result.main}</strong>
                <span className="muted small">{result.secondary}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
