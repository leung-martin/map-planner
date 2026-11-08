import { DIMENSIONS } from '../scoring';
import type { PlaceScores } from '../types';

export function ScoreStrip({ scores }: { scores: PlaceScores }) {
  return (
    <span className="score-strip">
      {DIMENSIONS.map(({ key, label, icon }) => (
        <span key={key} className="score" title={`${label}: ${scores[key]} of 5`} aria-label={`${label}: ${scores[key]} of 5`}>
          <span aria-hidden="true">{icon}</span> {scores[key]}
        </span>
      ))}
    </span>
  );
}

export function ScoreMeters({ scores }: { scores: PlaceScores }) {
  return (
    <dl className="score-meters">
      {DIMENSIONS.map(({ key, label, icon }) => (
        <div key={key} className="score-meter">
          <dt><span aria-hidden="true">{icon}</span> {label}</dt>
          <dd aria-label={`${scores[key]} of 5`}>
            {[1, 2, 3, 4, 5].map((step) => <span key={step} className={step <= scores[key] ? 'pip on' : 'pip'} />)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
