// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { distanceKm, KmlError, parseKml } from './importKml';

const kml = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>TOKYO</name>${body}</Document></kml>`;

const placemark = (name: string, geometry: string) => `<Placemark><name>${name}</name>${geometry}</Placemark>`;
const point = (coordinates: string) => `<Point><coordinates>${coordinates}</coordinates></Point>`;

describe('parseKml', () => {
  it('reads names and coordinates, longitude first, including inside folders', () => {
    const parsed = parseKml(kml(`<Folder><name>Layer</name>${placemark('Azabudai Hills', point('\n 139.7405,35.6605,0\n'))}</Folder>`));
    expect(parsed.title).toBe('TOKYO');
    expect(parsed.pins).toEqual([{ name: 'Azabudai Hills', location: { lat: 35.6605, lng: 139.7405 } }]);
  });

  it('keeps non-Latin names and decodes CDATA and entities', () => {
    const parsed = parseKml(kml(
      placemark('けやき坂イルミネーション', point('139.73,35.66,0')) + placemark('<![CDATA[A & B]]>', point('139.7,35.6,0')) + placemark('C &amp; D', point('139.7,35.6,0')),
    ));
    expect(parsed.pins.map((pin) => pin.name)).toEqual(['けやき坂イルミネーション', 'A & B', 'C & D']);
  });

  it('skips drawn lines but keeps the pins beside them', () => {
    const parsed = parseKml(kml(placemark('Route', '<LineString><coordinates>1,2,0 3,4,0</coordinates></LineString>') + placemark('Pin', point('1,2,0'))));
    expect(parsed.pins).toHaveLength(1);
    expect(parsed.skipped).toBe(1);
  });

  it('explains a KMZ file, and rejects bad or empty files', () => {
    expect(() => parseKml('PK\u0003\u0004binary')).toThrow(/Export as KML/);
    expect(() => parseKml('not xml at all')).toThrow(KmlError);
    expect(() => parseKml(kml(''))).toThrow(/No places/);
  });
});

describe('distanceKm', () => {
  it('measures roughly the right distance', () => {
    const paris = { lat: 48.8566, lng: 2.3522 };
    const rome = { lat: 41.9028, lng: 12.4964 };
    expect(distanceKm(paris, rome)).toBeGreaterThan(1090);
    expect(distanceKm(paris, rome)).toBeLessThan(1120);
    expect(distanceKm(paris, paris)).toBe(0);
  });
});
