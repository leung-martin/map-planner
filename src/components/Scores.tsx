import { DIMENSIONS, totalScore, MAX_TOTAL } from '../scoring';
import type { PlaceScores } from '../types';

/** The four ratings stacked vertically. With `labels`, each row also names its rating. */
export function ScoreStack({ scores, labels }: { scores: PlaceScores; labels?: boolean }) {
  return (
    <span className={labels ? 'score-stack labelled' : 'score-stack'}>
      {DIMENSIONS.map(({ key, label, icon }) => (
        <span key={key} className="score-row" title={`${label}: ${scores[key]} of 5`} aria-label={`${label}: ${scores[key]} of 5`}>
          <span className="score-icon" aria-hidden="true">{icon}</span>
          {labels && <span className="score-label" aria-hidden="true">{label}</span>}
          <span className="score-bars" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((step) => <span key={step} className={step <= scores[key] ? 'pip on' : 'pip'} />)}
          </span>
          <span className="score-value" aria-hidden="true">{scores[key]}/5</span>
        </span>
      ))}
    </span>
  );
}

export function ScoreTotal({ scores }: { scores: PlaceScores }) {
  const total = totalScore(scores);
  return (
    <span className="score-total" title={`Total: ${total} of ${MAX_TOTAL}`} aria-label={`Total score: ${total} of ${MAX_TOTAL}`}>
      <b aria-hidden="true">{total}</b>
      <span aria-hidden="true">/{MAX_TOTAL}</span>
    </span>
  );
}
