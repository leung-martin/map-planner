const env = import.meta.env;

export const googleMapsApiKey: string = env.VITE_GOOGLE_MAPS_API_KEY ?? '';
export const googleMapsMapId: string = env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string,
  appId: env.VITE_FIREBASE_APP_ID as string,
};

export const recaptchaSiteKey: string = env.VITE_RECAPTCHA_SITE_KEY ?? '';

export const hasFirebase = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
