import { useEffect, useRef, useState } from 'react';
import { googleMapsMapId } from '../config';
import { useTheme } from '../theme';
import { createPinElement } from './pin';
import type { MapPin, MapViewProps } from './provider';
import { loadGoogleMaps } from './googleProvider';

type Libraries = { maps: google.maps.MapsLibrary; marker: google.maps.MarkerLibrary };

export function GoogleMapView({ pins, fitKey, fallback, onPinClick, onPoiClick }: MapViewProps) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markers = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const [libraries, setLibraries] = useState<Libraries | null>(null);
  const [error, setError] = useState('');
  const { resolved: theme } = useTheme();

  // Listeners live as long as the map, so they read the latest callbacks through a ref.
  const callbacks = useRef({ onPinClick, onPoiClick });
  callbacks.current = { onPinClick, onPoiClick };

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
      {error && <div className="map-message">{error}</div>}
    </div>
  );
}
