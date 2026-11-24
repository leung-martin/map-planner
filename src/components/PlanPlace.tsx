import { MapPin, MapPinOff, Search } from 'lucide-react';
import { useState } from 'react';
import { whereOf } from '../checkPlaces';
import type { Suggestion } from '../maps/provider';
import { googleMapsUrl } from '../trip';
import type { SavedPlace } from '../types';
import { MapsLink } from './Hud';
import { LazyField } from './LazyField';
import { SearchBox } from './SearchBox';

type Props = {
  place: SavedPlace;
  /** The pinned place this plan happens at, if any. */
  spot: { placeId: string; name: string } | null;
  /** A place the plan names that has no pin yet. */
  missing: string | null;
  /** How many other plans are written as happening at the same place. */
  others: number;
  search(query: string): Promise<Suggestion[]>;
  onWhere(text: string, alsoOthers: boolean): void;
  onPick(suggestion: Suggestion, alsoOthers: boolean): void;
};

/**
 * Where a plan happens, in the card editor: fix a typo in the wording,
 * or find the real place on Google Maps, for this plan and any others written the same way.
 */
export function PlanPlace({ place, spot, missing, others, search, onWhere, onPick }: Props) {
  const [finding, setFinding] = useState(false);
  const [alsoOthers, setAlsoOthers] = useState(true);
  const where = whereOf(place);

  return (
    <div className="plan-place">
      <div className="plan-place-row">
        {spot ? <MapPin size={18} aria-hidden="true" className="plan-place-on" /> : <MapPinOff size={18} aria-hidden="true" className={missing ? 'plan-place-missing' : 'muted'} />}
        <LazyField
          key={`where-${place.id}`}
          className="plan-where"
          label="Where"
          placeholder="Where it happens"
          value={where}
          onCommit={(text) => text.trim() !== where && onWhere(text.trim(), alsoOthers)}
        />
        <button className="chip" aria-expanded={finding} onClick={() => setFinding(!finding)}>
          <Search size={15} aria-hidden="true" /> Find
        </button>
      </div>
      <p className="small plan-place-status">
        {spot ? (
          <>
            <span className="clip grow">At <b>{spot.name}</b></span>
            <MapsLink href={googleMapsUrl(spot.placeId, spot.name)} name={spot.name} />
          </>
        ) : missing ? (
          <span className="plan-place-missing">Not on the map yet. Use Find to pin it.</span>
        ) : (
          <span className="muted">Not at a place on the map.</span>
        )}
      </p>
      {others > 0 && where && (
        <label className="small plan-place-others">
          <input type="checkbox" checked={alsoOthers} onChange={(event) => setAlsoOthers(event.target.checked)} />
          <span>Also {others} other {others === 1 ? 'card' : 'cards'} at “{where}”</span>
        </label>
      )}
      {finding && (
        <SearchBox
          key={place.id}
          autoFocus
          initialQuery={missing ?? where}
          placeholder="Search Google Maps"
          search={search}
          onPick={(suggestion) => {
            setFinding(false);
            onPick(suggestion, alsoOthers);
          }}
        />
      )}
    </div>
  );
}
