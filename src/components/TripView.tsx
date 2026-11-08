import { useEffect, useMemo, useRef, useState } from 'react';
import type { MapPin, MapsProvider, PlaceDetails, Suggestion } from '../maps/provider';
import {
  addCity, addDay, addPlace, addPlaces, dayColor, dayNumber, dayRoute, removeCity, removePlace, updatePlace,
  UNSCHEDULED_COLOR,
} from '../trip';
import type { Bounds, Day, SavedPlace, Trip } from '../types';
import { KmlError, parseKml, type ParsedKml } from '../importKml';
import { useTheme } from '../theme';
import { DayDialog } from './DayDialog';
import { ThemeToggle } from './Hud';
import { ImportDialog } from './ImportDialog';
import { LazyField } from './LazyField';
import { PlaceItem } from './PlaceItem';
import { PreviewCard } from './PreviewCard';
import { SearchBox } from './SearchBox';

type Props = {
  trip: Trip;
  provider: MapsProvider;
  onChange(trip: Trip): void;
};

type Preview = { details: PlaceDetails; fromSearch: boolean };

const ALL = 'all';
const UNSCHEDULED = 'none';

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

const formatDate = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

export function TripView({ trip, provider, onChange }: Props) {
  const [tab, setTab] = useState(trip.cities[0]?.id ?? ALL);
  const [dayFilter, setDayFilter] = useState(ALL);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [addingCity, setAddingCity] = useState(trip.cities.length === 0);
  const [editingDayId, setEditingDayId] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [cityBounds, setCityBounds] = useState<Bounds | null>(null);
  const { resolved: theme } = useTheme();
  const [importing, setImporting] = useState<ParsedKml | null>(null);
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

  const cityPlaces = city ? trip.places.filter((p) => p.cityId === city.id) : trip.places;
  const days = city ? trip.days.filter((d) => d.cityIds.includes(city.id)) : trip.days;
  const activeFilter = dayFilter === UNSCHEDULED || days.some((d) => d.id === dayFilter) ? dayFilter : ALL;

  // Only the open city is looked up, which keeps a large trip well inside the free allowance.
  const details = usePlaceDetails(provider, [...new Set(cityPlaces.map((p) => p.placeId))]);

  const shown = useMemo(
    () =>
      trip.places.filter(
        (p) =>
          (!city || p.cityId === city.id) &&
          (activeFilter === ALL || p.dayId === (activeFilter === UNSCHEDULED ? null : activeFilter)),
      ),
    [trip.places, city?.id, activeFilter],
  );
  const unscheduled = shown.filter((p) => p.dayId === null);
  const shownDays = activeFilter === ALL ? days : days.filter((d) => d.id === activeFilter);

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
        color: day ? dayColor(day) : UNSCHEDULED_COLOR,
        label: day ? String(dayNumber(trip, day.id)) : '•',
        title: place.nickname || info.name,
        selected: place.id === expandedId && !preview,
      });
    }
    if (preview) {
      result.push({
        id: 'preview',
        placeId: preview.details.placeId,
        location: preview.details.location,
        color: '#bd5508',
        label: '+',
        title: preview.details.name,
        selected: true,
      });
    }
    return result;
  }, [shown, details, trip, expandedId, preview]);

  const pending = shown.some((p) => details[p.placeId] === undefined);
  const fitKey = [
    activeTab, activeFilter, pending ? 'loading' : 'ready', cityBounds ? `${cityBounds.north},${cityBounds.west}` : '',
    preview?.fromSearch ? preview.details.placeId : '',
  ].join('|');

  const showPreview = (next: Preview) => {
    setLookupError('');
    setExpandedId(null);
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
    if (latest.current.cities.length === 0) return;
    provider.getPlace(placeId).then((result) => showPreview({ details: result, fromSearch: false })).catch(lookupFailed);
  };

  const onImportFile = async (file: File) => {
    setLookupError('');
    try {
      setImporting(parseKml(await file.text()));
    } catch (reason) {
      setLookupError(reason instanceof KmlError ? reason.message : 'That file couldn’t be opened.');
    }
  };

  const onAddDay = () => {
    const lastCity = trip.days[trip.days.length - 1]?.cityIds.at(-1);
    update((current) => addDay(current, city?.id ?? lastCity ?? current.cities[0].id));
  };

  const previewCityId = city?.id ?? trip.cities[0]?.id ?? '';
  const previewDay = trip.days.find((d) => d.id === activeFilter && d.cityIds.includes(previewCityId));
  const editingDay = trip.days.find((d) => d.id === editingDayId);

  const placeItem = (place: SavedPlace) => (
    <PlaceItem
      key={place.id}
      trip={trip}
      place={place}
      details={details[place.placeId]}
      expanded={place.id === expandedId}
      onToggle={() => {
        setPreview(null);
        setExpandedId(place.id === expandedId ? null : place.id);
      }}
      onChange={(patch) => update((current) => updatePlace(current, place.id, patch))}
      onRemove={() => {
        update((current) => removePlace(current, place.id));
        setExpandedId(null);
      }}
    />
  );

  const dayHeading = (day: Day) => (
    <h3 className="day-heading">
      <span className="dot" style={{ background: dayColor(day) }}>{dayNumber(trip, day.id)}</span>
      <span className="clip grow">
        {dayRoute(trip, day)}
        {day.date && <span className="muted small"> · {formatDate(day.date)}</span>}
      </span>
      <button className="text-button" aria-label={`Edit day ${dayNumber(trip, day.id)}`} onClick={() => setEditingDayId(day.id)}>
        Edit
      </button>
    </h3>
  );

  const MapView = provider.MapView;

  return (
    <div className="trip">
      <header className="trip-header">
        <a className="back" href="#/" aria-label="Back to trips">←</a>
        <LazyField
          className="trip-name"
          label="Trip name"
          value={trip.name}
          onCommit={(name) => name.trim() && update((current) => ({ ...current, name: name.trim() }))}
        />
        <ThemeToggle />
      </header>

      <nav className="city-tabs" aria-label="Cities">
        {trip.cities.length > 1 && (
          <button className={activeTab === ALL ? 'tab active' : 'tab'} onClick={() => setTab(ALL)}>Whole trip</button>
        )}
        {trip.cities.map((c) => (
          <button key={c.id} className={activeTab === c.id ? 'tab active' : 'tab'} onClick={() => setTab(c.id)}>
            {c.name}
          </button>
        ))}
        <button className="tab add" onClick={() => setAddingCity((open) => !open)}>+ City</button>
      </nav>

      <div className="workspace">
        <section className="panel">
          <div className="tools">
            {addingCity && (
              <div className="add-city">
                {trip.cities.length === 0 && <p className="muted small">Which city are you visiting first?</p>}
                <SearchBox placeholder="Add a city" autoFocus search={provider.searchCities} onPick={pickCity} />
              </div>
            )}
            {trip.cities.length > 0 && (
              <SearchBox
                placeholder={city ? `Find a place in ${city.name}` : 'Find a place'}
                search={(query) => provider.searchPlaces(query, cityBounds)}
                onPick={pickSuggestion}
              />
            )}
            {lookupError && <p className="error-text small">{lookupError}</p>}
            {preview && (
              <PreviewCard
                key={preview.details.placeId}
                trip={trip}
                details={preview.details}
                existing={trip.places.find((p) => p.placeId === preview.details.placeId)}
                defaultCityId={previewCityId}
                defaultDayId={previewDay?.id ?? null}
                onCancel={() => setPreview(null)}
                onShowExisting={(place) => {
                  setPreview(null);
                  setDayFilter(ALL);
                  if (city && city.id !== place.cityId) setTab(place.cityId);
                  setExpandedId(place.id);
                }}
                onSave={(cityId, dayId) => {
                  update((current) => addPlace(current, { placeId: preview.details.placeId, cityId, dayId }));
                  if (city && city.id !== cityId) setTab(cityId);
                  setPreview(null);
                }}
              />
            )}
            {trip.cities.length > 0 && (
              <div className="chips" role="group" aria-label="Filter by day">
                <button className={activeFilter === ALL ? 'chip active' : 'chip'} onClick={() => setDayFilter(ALL)}>All</button>
                {days.map((day) => (
                  <button
                    key={day.id}
                    className={activeFilter === day.id ? 'chip day active' : 'chip day'}
                    style={{ '--chip-color': dayColor(day) } as React.CSSProperties}
                    aria-label={`Day ${dayNumber(trip, day.id)}`}
                    onClick={() => setDayFilter(activeFilter === day.id ? ALL : day.id)}
                  >
                    {dayNumber(trip, day.id)}
                  </button>
                ))}
                <button
                  className={activeFilter === UNSCHEDULED ? 'chip active' : 'chip'}
                  onClick={() => setDayFilter(activeFilter === UNSCHEDULED ? ALL : UNSCHEDULED)}
                >
                  Not scheduled
                </button>
                <button className="chip add" onClick={onAddDay}>+ Day</button>
                <button className="chip add" title="Import a KML file exported from Google My Maps" onClick={() => fileInput.current?.click()}>
                  Import
                </button>
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
            )}
          </div>

          <div className="list">
            {(unscheduled.length > 0 || activeFilter === UNSCHEDULED) && (
              <section>
                <h3 className="day-heading">
                  <span className="dot" style={{ background: UNSCHEDULED_COLOR }}>•</span>
                  <span className="grow">Not scheduled</span>
                </h3>
                {unscheduled.length > 0
                  ? <ul>{unscheduled.map(placeItem)}</ul>
                  : <p className="muted small day-empty">Everything here has a day.</p>}
              </section>
            )}
            {activeFilter !== UNSCHEDULED && shownDays.map((day) => {
              const dayPlaces = shown.filter((p) => p.dayId === day.id);
              return (
                <section key={day.id}>
                  {dayHeading(day)}
                  {dayPlaces.length > 0
                    ? <ul>{dayPlaces.map(placeItem)}</ul>
                    : <p className="muted small day-empty">No places yet.</p>}
                </section>
              );
            })}
            {trip.cities.length > 0 && cityPlaces.length === 0 && days.length === 0 && (
              <p className="muted empty">Search above or tap a place on the map to save it.</p>
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
        </section>

        <div className="map-pane hud-frame">
          <MapView
            key={theme}
            pins={pins}
            fitKey={fitKey}
            fallback={cityBounds}
            onPinClick={(id) => {
              if (id === 'preview') return;
              setPreview(null);
              setExpandedId(id);
            }}
            onPoiClick={onPoiClick}
          />
        </div>
      </div>

      {importing && (
        <ImportDialog
          trip={trip}
          provider={provider}
          file={importing}
          defaultCityId={previewCityId}
          onClose={() => setImporting(null)}
          onSave={(cityId, placeIds) => {
            update((current) => addPlaces(current, cityId, placeIds));
            if (city && city.id !== cityId) setTab(cityId);
            setDayFilter(ALL);
            setImporting(null);
          }}
        />
      )}

      {editingDay && (
        <DayDialog trip={trip} day={editingDay} onUpdate={update} onClose={() => setEditingDayId(null)} />
      )}
    </div>
  );
}
