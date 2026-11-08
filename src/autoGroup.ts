import { distanceKm } from './importKml';
import type { LatLng } from './types';

type Located = { location: LatLng };

function mean(items: Located[]): LatLng {
  const sum = items.reduce((total, { location }) => ({ lat: total.lat + location.lat, lng: total.lng + location.lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / items.length, lng: sum.lng / items.length };
}

/** Spreads starting points far apart, so nothing depends on chance and reruns give the same days. */
function startingCenters(items: Located[], count: number): LatLng[] {
  const middle = mean(items);
  const farthestFrom = (points: LatLng[]) =>
    items.reduce((best, item) => {
      const score = (candidate: Located) => Math.min(...points.map((point) => distanceKm(point, candidate.location)));
      return score(item) > score(best) ? item : best;
    }).location;
  const centers = [farthestFrom([middle])];
  while (centers.length < count) centers.push(farthestFrom(centers));
  return centers;
}

/**
 * Splits places into at most `days` groups of nearby places. No group gets more than one above
 * an even share, so a dense area can't swallow the whole trip. Groups run west to east.
 */
export function groupByLocation<T extends Located>(items: T[], days: number): T[][] {
  const count = Math.min(Math.floor(days), items.length);
  if (count <= 0) return [];

  let centers = startingCenters(items, count);
  let groups: T[][] = [];
  for (let round = 0; round < 25; round++) {
    groups = centers.map(() => []);
    for (const item of items) {
      const distances = centers.map((center) => distanceKm(center, item.location));
      groups[distances.indexOf(Math.min(...distances))].push(item);
    }
    centers = groups.map((group, index) => (group.length > 0 ? mean(group) : centers[index]));
  }

  const limit = Math.ceil(items.length / count) + 1;
  for (const group of groups) {
    while (group.length > limit) {
      // Move whichever place loses least by going to a group with room.
      let best = { cost: Infinity, itemIndex: 0, target: 0 };
      group.forEach((item, itemIndex) => {
        const here = distanceKm(centers[groups.indexOf(group)], item.location);
        groups.forEach((other, target) => {
          if (other.length >= limit) return;
          const cost = distanceKm(centers[target], item.location) - here;
          if (cost < best.cost) best = { cost, itemIndex, target };
        });
      });
      groups[best.target].push(group.splice(best.itemIndex, 1)[0]);
    }
  }

  return groups.filter((group) => group.length > 0).sort((a, b) => mean(a).lng - mean(b).lng);
}
