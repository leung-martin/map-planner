import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { googleMapsMapId } from '../config';
import { useTheme } from '../theme';
import type { LatLng } from '../types';
import { createPinElement } from './pin';
import type { MapPin, MapViewProps } from './provider';
import { loadGoogleMaps } from './googleProvider';

type Libraries = { maps: google.maps.MapsLibrary; marker: google.maps.MarkerLibrary };

// Room left for the search bar that floats over the top of the map.
const POPOUT_TOP_GAP = 68;
const POPOUT_SIDE_GAP = 8;
// Matches the card's offset in styles.css, which clears the pin.
const POPOUT_ABOVE_POINT = 62;

/** Keeps a card on a map position, and nudges the map once if the card would be cut off. */
function Popout({ map, location, children }: { map: google.maps.Map; location: LatLng; children: ReactNode }) {
  const [holder] = useState(() => {
    const div = document.createElement('div');
    div.className = 'map-popout';
    google.maps.OverlayView.preventMapHitsAndGesturesFrom(div);
    return div;
  });

  useEffect(() => {
    /** Returns false while the pin isn't on screen yet, as when the map is still on its way there. */
    const bringIntoView = () => {
      const point = overlay.getProjection()?.fromLatLngToContainerPixel(location);
      const area = map.getDiv();
      if (!point || point.x < 0 || point.y < 0 || point.x > area.offsetWidth || point.y > area.offsetHeight) return false;
      const halfWidth = holder.offsetWidth / 2;
      const overLeft = point.x - halfWidth - POPOUT_SIDE_GAP;
      const overRight = point.x + halfWidth + POPOUT_SIDE_GAP - area.offsetWidth;
      const overTop = point.y - POPOUT_ABOVE_POINT - holder.offsetHeight - POPOUT_TOP_GAP;
      const x = overLeft < 0 ? overLeft : Math.max(overRight, 0);
      const y = Math.min(overTop, 0);
      if (x || y) map.panBy(x, y);
      return true;
    };

    let drawn = false;
    const overlay = new google.maps.OverlayView();
    overlay.onAdd = () => overlay.getPanes()!.floatPane.append(holder);
    overlay.onRemove = () => holder.remove();
    overlay.draw = () => {
      const point = overlay.getProjection().fromLatLngToDivPixel(location);
      if (!point) return;
      holder.style.left = `${point.x}px`;
      holder.style.top = `${point.y}px`;
      if (!drawn) {
        drawn = true;
        // A map that is already in place never reports going idle.
        if (map.getCenter()?.equals(new google.maps.LatLng(location)) && bringIntoView()) settled.remove();
      }
    };
    // Waits for the map to finish moving to the pin, and only once so the user can then pan freely.
    const settled = map.addListener('idle', () => {
      if (bringIntoView()) settled.remove();
    });
    overlay.setMap(map);
    return () => {
      settled.remove();
      overlay.setMap(null);
    };
  }, [map, holder, location.lat, location.lng]);

  return createPortal(children, holder);
}

export function GoogleMapView({ pins, fitKey, fallback, popout, onPinClick, onPoiClick, onViewChange }: MapViewProps) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markers = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const [libraries, setLibraries] = useState<Libraries | null>(null);
  const [error, setError] = useState('');
  const { resolved: theme } = useTheme();

  // Listeners live as long as the map, so they read the latest callbacks through a ref.
  const callbacks = useRef({ onPinClick, onPoiClick, onViewChange });
  callbacks.current = { onPinClick, onPoiClick, onViewChange };

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(async () => {
        const [maps, marker] = await Promise.all([
          google.maps.importLibrary('maps') as Promise<google.maps.MapsLibrary>,
          google.maps.importLibrary('marker') as Promise<google.maps.MarkerLibrary>,
        ]);
        if (cancelled || !element.current) return;
        map.current = new maps.Map(element.current, {
          center: { lat: 30, lng: 10 },
          zoom: 2,
          mapId: googleMapsMapId,
          // Fixed when the map is created, so TripView remounts this view when the theme changes.
          colorScheme: theme === 'dark' ? 'DARK' : 'LIGHT',
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: 'greedy',
        });
        map.current.addListener('click', (event: google.maps.IconMouseEvent) => {
          if (event.placeId) {
            event.stop();
            callbacks.current.onPoiClick(event.placeId);
          }
        });
        map.current.addListener('idle', () => {
          const area = map.current?.getBounds()?.toJSON();
          if (area) callbacks.current.onViewChange(area);
        });
        setLibraries({ maps, marker });
      })
      .catch((reason: Error) => setError(reason.message));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!libraries || !map.current) return;
    markers.current.forEach((marker) => (marker.map = null));
    markers.current = pins.map((pin: MapPin) => {
      const marker = new libraries.marker.AdvancedMarkerElement({
        map: map.current,
        position: pin.location,
        content: createPinElement(pin),
        title: pin.title,
        gmpClickable: true,
        zIndex: pin.selected ? 1000 : undefined,
      });
      marker.addEventListener('gmp-click', () => callbacks.current.onPinClick(pin.id));
      return marker;
    });
  }, [libraries, pins]);

  // Reframing depends only on fitKey, so changing a pin's day doesn't move the map.
  const latest = useRef({ pins, fallback });
  latest.current = { pins, fallback };
  useEffect(() => {
    if (!libraries || !map.current) return;
    const { pins: current, fallback: area } = latest.current;
    if (current.length > 1) {
      const box = new google.maps.LatLngBounds();
      current.forEach((pin) => box.extend(pin.location));
      map.current.fitBounds(box, 64);
    } else if (current.length === 1) {
      map.current.setCenter(current[0].location);
      map.current.setZoom(15);
    } else if (area) {
      map.current.fitBounds(area);
    }
  }, [libraries, fitKey]);

  // Only a single selection moves the map; a boxed group is already in view.
  const highlighted = pins.filter((pin) => pin.selected);
  const selected = highlighted.length === 1 ? highlighted[0] : undefined;
  useEffect(() => {
    if (selected) map.current?.panTo(selected.location);
  }, [selected?.id, selected?.placeId]);

  return (
    <div className="map-fill">
      <div ref={element} className="map-canvas" />
      {libraries && map.current && popout && <Popout map={map.current} location={popout.location}>{popout.content}</Popout>}
      {error && <div className="map-message">{error}</div>}
    </div>
  );
}
