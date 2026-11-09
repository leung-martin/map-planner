export type Point = { x: number; y: number };
export type Box = { left: number; top: number; right: number; bottom: number };

export function boxFrom(a: Point, b: Point): Box {
  return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) };
}

export function idsInBox(box: Box, pins: (Point & { id: string })[]): string[] {
  return pins.filter((pin) => pin.x >= box.left && pin.x <= box.right && pin.y >= box.top && pin.y <= box.bottom).map((pin) => pin.id);
}
