import type { LatLng } from './types';

export type ImportedPin = { name: string; location: LatLng };

export type ParsedKml = {
  title: string;
  pins: ImportedPin[];
  /** Drawn lines and shapes, which aren't places. */
  skipped: number;
};

export class KmlError extends Error {}

export function parseKml(text: string): ParsedKml {
  // KMZ is a zip archive, which always starts with these two bytes.
  if (text.startsWith('PK')) {
    throw new KmlError('That’s a KMZ file. In My Maps, tick “Export as KML” when you export, then try again.');
  }
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  if (xml.querySelector('parsererror')) throw new KmlError('That file couldn’t be read as KML.');

  const textOf = (parent: Element, tag: string) => parent.getElementsByTagName(tag)[0]?.textContent?.trim() ?? '';

  const pins: ImportedPin[] = [];
  let skipped = 0;
  for (const placemark of xml.getElementsByTagName('Placemark')) {
    const point = placemark.getElementsByTagName('Point')[0];
    // KML writes coordinates as longitude,latitude[,altitude].
    const [lng, lat] = point ? textOf(point, 'coordinates').split(',').map(Number) : [NaN, NaN];
    const name = textOf(placemark, 'name');
    if (name && Number.isFinite(lat) && Number.isFinite(lng)) pins.push({ name, location: { lat, lng } });
    else skipped++;
  }
  if (pins.length === 0) throw new KmlError('No places were found in that file.');

  const documentElement = xml.getElementsByTagName('Document')[0];
  return { title: documentElement ? textOf(documentElement, 'name') : '', pins, skipped };
}

export function distanceKm(a: LatLng, b: LatLng): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
