import { useEffect, useState } from 'react';

// Unsplash photos, free to use under the Unsplash License.
const PHOTOS = [
  '1502602898657-3e91760cbb34', // Paris at dusk
  '1476514525535-07fb3b4ae5f1', // Alpine lake
  '1493976040374-85c8e12f0c0e', // Kyoto street
  '1464822759023-fed622ff2c3b', // Mountain range
  '1499856871958-5b9627545d1a', // Bridge over the Seine
  '1530789253388-582c481c54b0', // Balloons over rock valleys
];

const ROTATE_MS = 45_000;
const SIZES = '100vw';

const url = (index: number, width: number) =>
  `https://images.unsplash.com/photo-${PHOTOS[index]}?auto=format&fit=crop&w=${width}&q=70`;
const srcSet = (index: number) => [1080, 1920, 2560].map((width) => `${url(index, width)} ${width}w`).join(', ');

const start = Math.floor(Math.random() * PHOTOS.length);

export function Backdrop() {
  // At most two photos: the last one fades in over the one before it.
  const [layers, setLayers] = useState([start]);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const current = layers[layers.length - 1];
    const next = (current + 1) % PHOTOS.length;
    let stale = false;
    const timer = window.setTimeout(() => {
      const preload = new Image();
      preload.sizes = SIZES;
      preload.srcset = srcSet(next);
      preload.onload = () => !stale && setLayers([current, next]);
      // Offline, for example. Keep this photo and try again next round.
      preload.onerror = () => !stale && setLayers([current]);
    }, ROTATE_MS);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [layers]);

  return (
    <div className="backdrop" aria-hidden="true">
      {layers.map((index, position) => (
        <img
          key={index}
          className={position === layers.length - 1 ? 'on' : ''}
          alt=""
          src={url(index, 1920)}
          srcSet={srcSet(index)}
          sizes={SIZES}
        />
      ))}
      <div className="backdrop-scrim" />
    </div>
  );
}
