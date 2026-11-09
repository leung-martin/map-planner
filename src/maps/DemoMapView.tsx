import { useEffect, useMemo, useRef } from 'react';
import type { Bounds, LatLng } from '../types';
import { DEMO_PLACES } from './demoProvider';
import { pinClass } from './pin';
import type { MapViewProps } from './provider';

const WORLD: Bounds = { north: 60, south: 20, east: 150, west: -10 };

function boundsAround(points: LatLng[]): Bounds {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const pad = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lngs) - Math.min(...lngs), 0.1) * 0.25;
  return {
    north: Math.max(...lats) + pad,
    south: Math.min(...lats) - pad,
    east: Math.max(...lngs) + pad,
    west: Math.min(...lngs) - pad,
  };
}

/** A plain stand-in for the Google map, used only when no API key is set. */
export function DemoMapView({ pins, fitKey, fallback, popout, onPinClick, onPoiClick, onViewChange }: MapViewProps) {
  // As on the real map, the frame changes only when fitKey does.
  const latest = useRef({ pins, fallback });
  latest.current = { pins, fallback };
  const frame = useMemo(() => {
    const { pins: current, fallback: area } = latest.current;
    return current.length > 0 ? boundsAround(current.map((p) => p.location)) : (area ?? WORLD);
  }, [fitKey]);

  useEffect(() => onViewChange(frame), [frame]);

  const position = ({ lat, lng }: LatLng) => ({
    left: `${((lng - frame.west) / (frame.east - frame.west)) * 100}%`,
    top: `${((frame.north - lat) / (frame.north - frame.south)) * 100}%`,
  });

  return (
    <div className="map-fill demo-map">
      <div className="demo-map-note">Sample map. Add a Google key for the real one.</div>
      {DEMO_PLACES.filter(([id]) => !pins.some((pin) => pin.placeId === id)).map(([id, name, , , lat, lng]) => (
        <button key={id} className="demo-poi" style={position({ lat, lng })} title={name} onClick={() => onPoiClick(id)}>
          {name}
        </button>
      ))}
      {pins.map((pin) => (
        <button
          key={pin.id}
          data-pin-id={pin.id}
          className={`${pinClass(pin)} demo-pin`}
          style={{ ...position(pin.location), '--pin-color': pin.color } as React.CSSProperties}
          title={pin.title}
          onClick={() => onPinClick(pin.id)}
        >
          <span>{pin.label}</span>
        </button>
      ))}
      {popout && (
        // This map can't pan, so the card opens downward for pins near the top and stays within the sides.
        <div
          className={popout.location.lat > (frame.north + frame.south) / 2 ? 'map-popout below' : 'map-popout'}
          style={{ left: `clamp(165px, ${position(popout.location).left}, calc(100% - 165px))`, top: position(popout.location).top }}
        >
          {popout.content}
        </div>
      )}
    </div>
  );
}
