import { ArrowLeft, ArrowRight, CalendarDays, Globe, ListChecks, Plus, Sparkles, SquareDashedMousePointer, Upload, X } from 'lucide-react';

import { useEffect, useMemo, useRef, useState } from 'react';
import { groupByLocation } from '../autoGroup';
import { KmlError, parseKml } from '../importKml';
import type { MapPin, MapsProvider, PlaceDetails, Suggestion } from '../maps/provider';
import type { Scorer } from '../scoring';
import type { Suggester } from '../suggest';
import { useTheme } from '../theme';
import { useScoring } from '../useScoring';
import {
  addCity, addDay, addPlace, addPlaces, assignGroups, assignPlaces, assignToNewDay, dayColor, dayNumber, MAYBE_COLOR, removeCity, removePlace, updatePlace,
} from '../trip';
import type { Bounds, SavedPlace, Trip } from '../types';
import { AutoGroupDialog } from './AutoGroupDialog';
import { BoxSelectLayer } from './BoxSelectLayer';
import { DayBoard } from './DayBoard';
import { DayDialog } from './DayDialog';
import { SettingsMenu, ThemeToggle } from './Hud';
import { LazyField } from './LazyField';
import { PlaceItem } from './PlaceItem';
import { PreviewCard } from './PreviewCard';
import { ReviewDialog, type ReviewRequest } from './ReviewDialog';
import { SearchBox } from './SearchBox';
import { SuggestDialog } from './SuggestDialog';

type Props = {
  trip: Trip;
  provider: MapsProvider;
  suggest: Suggester | null;
  scorer: Scorer | null;
  onChange(trip: Trip): void;
};

type Preview = { details: PlaceDetails; fromSearch: boolean };
type Step = 'places' | 'days';

const ALL = 'all';
const UNSCHEDULED = 'none';
const MUST_HAVE_COLOR = '#bd5508';
const PLACES_PER_DAY = 4;

function usePlaceDetails(provider: MapsProvider, placeIds: string[]) {
  const [byId, setById] = useState<Record<string, PlaceDetails | 'error'>>({});
  const [online, setOnline] = useState(0);
  useEffect(() => {
    const retry = () => setOnline((count) => count + 1);
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, []);

  const key = placeIds.join(',');
  useEffect(() => {
    let stale = false;
    // Applied as one update so the map redraws once rather than once per place.
    Promise.allSettled(placeIds.map((id) => provider.getPlace(id))).then((results) => {
      if (stale) return;
      setById((current) => {
        const next = { ...current };
        results.forEach((result, index) => {
          next[placeIds[index]] = result.status === 'fulfilled' ? result.value : 'error';
        });
        return next;
      });
    });
    return () => {
      stale = true;
    };
  }, [provider, key, online]);
  return byId;
}

export function TripView({ trip, provider, suggest, scorer, onChange }: Props) {
  const [step, setStep] = useState<Step>('places');
  const [tab, setTab] = useState(trip.cities[0]?.id ?? ALL);
  const [focus, setFocus] = useState(ALL);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [addingCity, setAddingCity] = useState(trip.cities.length === 0);
  const [editingDayId, setEditingDayId] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [cityBounds, setCityBounds] = useState<Bounds | null>(null);
  const { resolved: theme } = useTheme();
  const [reviewing, setReviewing] = useState<ReviewRequest | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [autoGrouping, setAutoGrouping] = useState(false);
  const [drawingBox, setDrawingBox] = useState(false);
  const [boxEmpty, setBoxEmpty] = useState(false);
  const [boxIds, setBoxIds] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const latest = useRef(trip);
  latest.current = trip;
  const update = (change: (current: Trip) => Trip) => {
    latest.current = change(latest.current);
    onChange(latest.current);
  };

  const city = trip.cities.find((c) => c.id === tab) ?? null;
  const activeTab = city ? tab : ALL;

  useEffect(() => {
    setCityBounds(null);
    if (!city) return;
    let stale = false;
    provider.getCityBounds(city.placeId).then((bounds) => !stale && setCityBounds(bounds)).catch(() => {});
    return () => {
      stale = true;
    };
  }, [provider, city?.placeId]);

  const cityPlaces = useMemo(
    () => (city ? trip.places.filter((p) => p.cityId === city.id) : trip.places),
    [trip.places, city?.id],
  );
  const days = city ? trip.days.filter((d) => d.cityIds.includes(city.id)) : trip.days;

  // Only the open city is looked up, which keeps a large trip well inside the free allowance.
  const details = usePlaceDetails(provider, [...new Set(cityPlaces.map((p) => p.placeId))]);

  const scoringMessage = useScoring({
    scorer,
    trip,
    places: cityPlaces,
    details,
    onScored: (id, scores) => update((current) => updatePlace(current, id, { scores })),
  });

  const activeFocus = step === 'days' && (focus === UNSCHEDULED || days.some((d) => d.id === focus)) ? focus : ALL;
  const shown = useMemo(
    () => cityPlaces.filter((p) => activeFocus === ALL || p.dayId === (activeFocus === UNSCHEDULED ? null : activeFocus)),
    [cityPlaces, activeFocus],
  );

  const pins = useMemo(() => {
    const result: MapPin[] = [];
    for (const place of shown) {
      const info = details[place.placeId];
      if (!info || info === 'error') continue;
      const day = trip.days.find((d) => d.id === place.dayId);
      result.push({
        id: place.id,
        placeId: place.placeId,
        location: info.location,
        color: day ? dayColor(day) : place.mustHave ? MUST_HAVE_COLOR : MAYBE_COLOR,
        label: day ? String(dayNumber(trip, day.id)) : place.mustHave ? '★' : '•',
        title: info.name,
        selected: (place.id === selectedId && !preview) || boxIds.includes(place.id),
      });
    }
    if (preview) {
      result.push({
        id: 'preview',
        placeId: preview.details.placeId,
        location: preview.details.location,
        color: MUST_HAVE_COLOR,
        label: '+',
        title: preview.details.name,
        selected: true,
      });
    }
    return result;
  }, [shown, details, trip, selectedId, preview, boxIds]);

  const pending = shown.some((p) => details[p.placeId] === undefined);
  const fitKey = [
    // The map is narrower in Plan days, so each step needs its own framing.
    step, activeTab, activeFocus, pending ? 'loading' : 'ready', cityBounds ? `${cityBounds.north},${cityBounds.west}` : '',
    preview?.fromSearch ? preview.details.placeId : '',
  ].join('|');

  const goToStep = (next: Step) => {
    setStep(next);
    setSelectedId(null);
    setPreview(null);
    setFocus(ALL);
    clearBox();
  };

  const clearBox = () => {
    setDrawingBox(false);
    setBoxEmpty(false);
    setBoxIds([]);
  };

  const showPreview = (next: Preview) => {
    setLookupError('');
    setSelectedId(null);
    setPreview(next);
  };
  const lookupFailed = () => setLookupError('Couldn’t load that place. Check your connection and try again.');

  const pickSuggestion = (suggestion: Suggestion) => {
    suggestion.resolve().then((result) => showPreview({ details: result, fromSearch: true })).catch(lookupFailed);
  };

  const pickCity = (suggestion: Suggestion) => {
    update((current) => addCity(current, { placeId: suggestion.placeId, name: suggestion.main }));
    setTab(latest.current.cities[latest.current.cities.length - 1].id);
    setAddingCity(false);
  };

  const onPoiClick = (placeId: string) => {
    if (latest.current.cities.length === 0 || step !== 'places') return;
    provider.getPlace(placeId).then((result) => showPreview({ details: result, fromSearch: false })).catch(lookupFailed);
  };

  const previewCityId = city?.id ?? trip.cities[0]?.id ?? '';

  const onImportFile = async (file: File) => {
    setLookupError('');
    try {
      const parsed = parseKml(await file.text());
      setReviewing({
        title: parsed.title ? `Import: ${parsed.title}` : 'Import',
        pins: parsed.pins,
        skipped: parsed.skipped,
        farKm: 1,
        farNote: 'Far from your original pin, check this one',
        preselect: true,
        starByDefault: true,
        cityId: previewCityId,
      });
    } catch (reason) {
      setLookupError(reason instanceof KmlError ? reason.message : 'That file couldn’t be opened.');
    }
  };

  const onAddDay = () => {
    const lastCity = trip.days[trip.days.length - 1]?.cityIds.at(-1);
    update((current) => addDay(current, city?.id ?? lastCity ?? current.cities[0].id));
  };

  const mustHaves = cityPlaces.filter((p) => p.mustHave);
  const maybes = cityPlaces.filter((p) => !p.mustHave);

  const applyAutoGroup = (dayCount: number, includeMaybes: boolean) => {
    if (!city) return;
    const items = (includeMaybes ? cityPlaces : mustHaves).flatMap((place) => {
      const info = details[place.placeId];
      return info && info !== 'error' ? [{ id: place.id, location: info.location }] : [];
    });
    const groups = groupByLocation(items, dayCount).map((group) => group.map((item) => item.id));
    update((current) => assignGroups(current, city.id, groups));
    setAutoGrouping(false);
    setSelectedId(null);
    setFocus(ALL);
  };

  const editingDay = trip.days.find((d) => d.id === editingDayId);

  const boxPlaces = cityPlaces.filter((p) => boxIds.includes(p.id));
  const boxCities = [...new Set(boxPlaces.map((p) => p.cityId))];
  const boxDays = trip.days.filter((d) => boxCities.every((id) => d.cityIds.includes(id)));

  const assignBox = (change: (current: Trip, ids: string[]) => Trip) => {
    const ids = boxPlaces.map((p) => p.id);
    update((current) => change(current, ids));
    clearBox();
    setSelectedId(null);
  };

  const placeItem = (place: SavedPlace) => (
    <PlaceItem
      key={place.id}
      trip={trip}
      place={place}
      details={details[place.placeId]}
      expanded={place.id === selectedId}
      onToggle={() => {
        setPreview(null);
        setSelectedId(place.id === selectedId ? null : place.id);
      }}
      onChange={(patch) => update((current) => updatePlace(current, place.id, patch))}
      onRemove={() => {
        update((current) => removePlace(current, place.id));
        setSelectedId(null);
      }}
    />
  );

  const MapView = provider.MapView;
  const hasCities = trip.cities.length > 0;

  const placesPanel = (
    <section className="panel">
      <div className="tools">
        <div className="tools-head">
          <h2 className="bar-title">Locations</h2>
          {hasCities && (
            <SettingsMenu>
              {(close) => (
                <button
                  role="menuitem"
                  title="Import a KML file exported from Google My Maps"
                  onClick={() => {
                    close();
                    fileInput.current?.click();
                  }}
                >
                  <Upload size={18} aria-hidden="true" /> Import from My Maps
                </button>
              )}
            </SettingsMenu>
          )}
          {/* No accept filter: Android's file picker greys out .kml files when one is set. */}
          <input
            ref={fileInput}
            type="file"
            hidden
            aria-label="KML file to import"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void onImportFile(file);
            }}
          />
        </div>
        {addingCity && (
          <div className="add-city">
            {!hasCities && <p className="muted small">Which city are you visiting first?</p>}
            <SearchBox placeholder="Add a city" autoFocus search={provider.searchCities} onPick={pickCity} />
          </div>
        )}
        {lookupError && <p className="error-text small">{lookupError}</p>}
      </div>

      <div className="list">
        {scoringMessage && <p className="muted small score-status" role="status">{scoringMessage}</p>}
        {mustHaves.length > 0 && (
          <section>
            <h3 className="day-heading"><span className="grow">★ Must-haves</span><span className="muted small">{mustHaves.length}</span></h3>
            <ul>{mustHaves.map(placeItem)}</ul>
          </section>
        )}
        {maybes.length > 0 && (
          <section>
            <h3 className="day-heading"><span className="grow maybe-label">Maybe</span><span className="muted small">{maybes.length}</span></h3>
            <ul>{maybes.map(placeItem)}</ul>
          </section>
        )}
        {hasCities && cityPlaces.length === 0 && (
          <p className="muted empty">Search on the map, tap a place, or get some suggestions.</p>
        )}
        {city && (
          <button
            className="text-button danger remove-city"
            onClick={() => {
              const count = cityPlaces.length;
              const warning = count > 0 ? ` Its ${count} saved place${count === 1 ? '' : 's'} will be deleted.` : '';
              if (window.confirm(`Remove ${city.name} from this trip?${warning}`)) {
                update((current) => removeCity(current, city.id));
                setTab(ALL);
              }
            }}
          >
            Remove {city.name} from this trip
          </button>
        )}
      </div>

      {cityPlaces.length > 0 && (
        <div className="next-step">
          <button className="primary" onClick={() => goToStep('days')}>Next: plan your days <ArrowRight size={20} aria-hidden="true" /></button>
        </div>
      )}
    </section>
  );

  return (
    <div className="trip">
      <header className="trip-header">
        <a className="back" href="#/" aria-label="Back to trips" title="Back to trips"><ArrowLeft size={24} aria-hidden="true" /></a>
        <LazyField
          className="trip-name"
          label="Trip name"
          value={trip.name}
          onCommit={(name) => name.trim() && update((current) => ({ ...current, name: name.trim() }))}
        />
        <ThemeToggle />
      </header>

      <div className="trip-nav">
        <h2 className="bar-title">Cities</h2>
        <nav className="city-tabs" aria-label="Cities">
          {trip.cities.length > 1 && (
            <button className={activeTab === ALL ? 'tab active' : 'tab'} onClick={() => setTab(ALL)}>
              <Globe size={18} aria-hidden="true" /> Whole trip
            </button>
          )}
          {trip.cities.map((c) => (
            <button key={c.id} className={activeTab === c.id ? 'tab active' : 'tab'} onClick={() => setTab(c.id)}>
              {c.name}
            </button>
          ))}
          <button className="tab add" onClick={() => setAddingCity((open) => !open)}><Plus size={18} aria-hidden="true" /> City</button>
        </nav>
        <div className="steps" role="group" aria-label="Planning steps">
          <button className={step === 'places' ? 'step active' : 'step'} aria-pressed={step === 'places'} onClick={() => goToStep('places')}>
            <ListChecks size={18} aria-hidden="true" /> <b>1</b> Choose places
          </button>
          <button className={step === 'days' ? 'step active' : 'step'} aria-pressed={step === 'days'} onClick={() => goToStep('days')}>
            <CalendarDays size={18} aria-hidden="true" /> <b>2</b> Plan days
          </button>
        </div>
      </div>

      <div className={step === 'days' ? 'workspace days' : 'workspace'}>
        {step === 'places' ? placesPanel : (
          <DayBoard
            trip={trip}
            places={cityPlaces}
            days={days}
            details={details}
            selectedId={selectedId}
            focus={activeFocus}
            unscheduledKey={UNSCHEDULED}
            canAutoGroup={city !== null && cityPlaces.length > 0}
            onSelect={setSelectedId}
            onMove={(id, dayId) => update((current) => updatePlace(current, id, { dayId }))}
            onFocus={(key) => setFocus(activeFocus === key ? ALL : key)}
            onAddDay={onAddDay}
            onEditDay={setEditingDayId}
            onAutoGroup={() => setAutoGrouping(true)}
          />
        )}

        <div className="map-pane hud-frame">
          <MapView
            key={theme}
            pins={pins}
            fitKey={fitKey}
            fallback={cityBounds}
            onPinClick={(id) => {
              if (id === 'preview') return;
              setPreview(null);
              setSelectedId(id);
            }}
            onPoiClick={onPoiClick}
          />
          {step === 'days' && drawingBox && (
            <BoxSelectLayer
              onCancel={clearBox}
              onSelect={(ids) => {
                if (ids.length === 0) {
                  setBoxEmpty(true);
                  return;
                }
                setSelectedId(null);
                setDrawingBox(false);
                setBoxEmpty(false);
                setBoxIds(ids);
              }}
            />
          )}
          {step === 'days' && cityPlaces.length > 0 && (
            <div className="map-overlay">
              {boxPlaces.length > 0 ? (
                <div className="box-bar">
                  <strong>{boxPlaces.length} {boxPlaces.length === 1 ? 'place' : 'places'}</strong>
                  <div className="chips" role="group" aria-label="Add selected places to a day">
                    {boxDays.map((day) => (
                      <button
                        key={day.id}
                        className="chip day"
                        style={{ '--chip-color': dayColor(day) } as React.CSSProperties}
                        aria-label={`Add to day ${dayNumber(trip, day.id)}`}
                        onClick={() => assignBox((current, ids) => assignPlaces(current, ids, day.id))}
                      >
                        {dayNumber(trip, day.id)}
                      </button>
                    ))}
                    {boxCities.length === 1 && (
                      <button className="chip add" onClick={() => assignBox((current, ids) => assignToNewDay(current, ids, boxCities[0]))}>
                        <Plus size={17} aria-hidden="true" /> New day
                      </button>
                    )}
                  </div>
                  <button className="icon-button" title="Clear selection" aria-label="Clear selection" onClick={clearBox}><X size={20} aria-hidden="true" /></button>
                </div>
              ) : drawingBox ? (
                <div className="box-bar drawing">
                  <span className="grow">{boxEmpty ? 'No places in that box. Try again.' : 'Drag across the map to draw a box.'}</span>
                  <button className="icon-button" title="Cancel" aria-label="Cancel drawing" onClick={clearBox}><X size={20} aria-hidden="true" /></button>
                </div>
              ) : (
                <button
                  className="primary map-draw"
                  onClick={() => {
                    setSelectedId(null);
                    setDrawingBox(true);
                  }}
                >
                  <SquareDashedMousePointer size={18} aria-hidden="true" /> Draw box
                </button>
              )}
            </div>
          )}
          {step === 'places' && hasCities && (
            <div className="map-overlay">
              <div className="map-search">
                <SearchBox
                  placeholder={city ? `Find a place in ${city.name}` : 'Find a place'}
                  search={(query) => provider.searchPlaces(query, cityBounds)}
                  onPick={pickSuggestion}
                />
                {suggest && (
                  <button className="primary map-suggest" title="Suggest places" aria-label="Suggest places" onClick={() => setSuggesting(true)}>
                    <Sparkles size={18} aria-hidden="true" /> <span>Suggest places</span>
                  </button>
                )}
              </div>
              {preview && (
                <PreviewCard
                  key={preview.details.placeId}
                  trip={trip}
                  details={preview.details}
                  existing={trip.places.find((p) => p.placeId === preview.details.placeId)}
                  defaultCityId={previewCityId}
                  onCancel={() => setPreview(null)}
                  onShowExisting={(place) => {
                    setPreview(null);
                    if (city && city.id !== place.cityId) setTab(place.cityId);
                    setSelectedId(place.id);
                  }}
                  onSave={(cityId, mustHave) => {
                    update((current) => addPlace(current, { placeId: preview.details.placeId, cityId, dayId: null, mustHave }));
                    if (city && city.id !== cityId) setTab(cityId);
                    setPreview(null);
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {suggesting && suggest && (
        <SuggestDialog
          trip={trip}
          provider={provider}
          suggest={suggest}
          defaultCityId={previewCityId}
          onClose={() => setSuggesting(false)}
          onResult={(request) => {
            setSuggesting(false);
            setReviewing(request);
          }}
        />
      )}

      {reviewing && (
        <ReviewDialog
          trip={trip}
          provider={provider}
          request={reviewing}
          onClose={() => setReviewing(null)}
          onSave={(cityId, placeIds, mustHave) => {
            update((current) => addPlaces(current, cityId, placeIds, mustHave));
            if (city && city.id !== cityId) setTab(cityId);
            setReviewing(null);
          }}
        />
      )}

      {autoGrouping && city && (
        <AutoGroupDialog
          cityName={city.name}
          mustHaves={mustHaves.length}
          maybes={maybes.length}
          defaultDays={days.length || Math.max(1, Math.ceil((mustHaves.length || cityPlaces.length) / PLACES_PER_DAY))}
          ready={!cityPlaces.some((p) => details[p.placeId] === undefined)}
          onApply={applyAutoGroup}
          onClose={() => setAutoGrouping(false)}
        />
      )}

      {editingDay && (
        <DayDialog trip={trip} day={editingDay} onUpdate={update} onClose={() => setEditingDayId(null)} />
      )}
    </div>
  );
}
