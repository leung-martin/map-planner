import { googleMapsApiKey } from '../config';
import { shortLocation } from '../trip';
import type { Bounds } from '../types';
import { GoogleMapView } from './GoogleMapView';
import type { MapsProvider, PlaceDetails, Suggestion } from './provider';

let scriptLoad: Promise<void> | null = null;

export function loadGoogleMaps(): Promise<void> {
  scriptLoad ??= new Promise((resolve, reject) => {
    const callback = '__mapPlannerGoogleReady';
    (window as unknown as Record<string, () => void>)[callback] = resolve;
    const script = document.createElement('script');
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsApiKey)}` +
      `&v=weekly&loading=async&callback=${callback}`;
    script.async = true;
    script.onerror = () => {
      scriptLoad = null;
      script.remove();
      reject(new Error('Could not load Google Maps. Check your connection.'));
    };
    document.head.append(script);
  });
  return scriptLoad;
}

async function placesLibrary() {
  await loadGoogleMaps();
  return (await google.maps.importLibrary('places')) as google.maps.PlacesLibrary;
}

// Name makes this a Pro-tier lookup; the photo is billed only when its image loads.
const DETAIL_FIELDS = ['displayName', 'addressComponents', 'location', 'photos'];

function toDetails(place: google.maps.places.Place): PlaceDetails {
  const photo = place.photos?.[0];
  return {
    placeId: place.id,
    name: place.displayName ?? 'Unnamed place',
    shortLocation: shortLocation(
      (place.addressComponents ?? []).map((part) => ({ longText: part.longText, types: part.types })),
    ),
    location: { lat: place.location!.lat(), lng: place.location!.lng() },
    photo: photo
      ? {
          url: (maxWidth) => photo.getURI({ maxWidth }),
          credits: photo.authorAttributions.map((a) => ({ name: a.displayName, uri: a.uri ?? '' })),
        }
      : null,
  };
}

const toBounds = (box: google.maps.LatLngBounds): Bounds => box.toJSON();

/** Runs at most `limit` tasks at once, so a large trip doesn't flood the API. */
function limiter(limit: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= limit) await new Promise<void>((go) => waiting.push(go));
    active++;
    try {
      return await task();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}

export function createGoogleProvider(): MapsProvider {
  // Memory only, so each place is paid for once per app launch and nothing is stored.
  const details = new Map<string, Promise<PlaceDetails>>();
  const bounds = new Map<string, Promise<Bounds | null>>();
  const limit = limiter(6);
  let token: google.maps.places.AutocompleteSessionToken | null = null;

  async function suggest(
    request: Omit<google.maps.places.AutocompleteRequest, 'sessionToken'>,
  ): Promise<Suggestion[]> {
    const { AutocompleteSessionToken, AutocompleteSuggestion } = await placesLibrary();
    token ??= new AutocompleteSessionToken();
    const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
      ...request,
      sessionToken: token,
    });
    return suggestions.flatMap(({ placePrediction: prediction }) =>
      prediction
        ? [{
            placeId: prediction.placeId,
            main: prediction.mainText?.text ?? prediction.text.text,
            secondary: prediction.secondaryText?.text ?? '',
            async resolve() {
              const place = prediction.toPlace();
              token = null;
              await place.fetchFields({ fields: DETAIL_FIELDS });
              const result = toDetails(place);
              details.set(result.placeId, Promise.resolve(result));
              return result;
            },
          }]
        : [],
    );
  }

  return {
    demo: false,
    MapView: GoogleMapView,
    searchCities: (input) => suggest({ input, includedPrimaryTypes: ['(cities)'] }),
    searchPlaces: (input, near) => suggest({ input, ...(near ? { locationBias: near } : {}) }),

    getPlace(placeId) {
      let pending = details.get(placeId);
      if (!pending) {
        pending = limit(async () => {
          const { Place } = await placesLibrary();
          const place = new Place({ id: placeId });
          await place.fetchFields({ fields: DETAIL_FIELDS });
          return toDetails(place);
        });
        details.set(placeId, pending);
        // A failure may just be a dropped connection, so allow a retry.
        pending.catch(() => details.delete(placeId));
      }
      return pending;
    },

    getCityBounds(placeId) {
      let pending = bounds.get(placeId);
      if (!pending) {
        pending = limit(async () => {
          const { Place } = await placesLibrary();
          const place = new Place({ id: placeId });
          await place.fetchFields({ fields: ['viewport'] });
          return place.viewport ? toBounds(place.viewport) : null;
        });
        bounds.set(placeId, pending);
        pending.catch(() => bounds.delete(placeId));
      }
      return pending;
    },
  };
}
