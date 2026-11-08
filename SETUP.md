# Map Planner setup

Until you add keys, the app runs in demo mode with a sample map and a few sample places, saved in that browser only.

```bash
npm run dev
```

Then open http://localhost:5173. Once keys are in place, `npm run dev:demo` still gives you the demo with no API usage, and `npm run dev:nosync` uses the real Google map without signing in.

## 1. Google Maps (map, search, place details)

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and link a billing account.
2. Under **APIs & Services > Library**, enable **Maps JavaScript API** and **Places API (New)**.
3. Under **APIs & Services > Credentials**, create an API key and edit it:
   - **Application restrictions:** Websites. Add `http://localhost:5173/*`, then `https://YOUR-FIREBASE-PROJECT.web.app/*` and `https://YOUR-FIREBASE-PROJECT.firebaseapp.com/*` once step 2 gives you the project name.
   - **API restrictions:** only the two APIs above.
4. Under **Google Maps Platform > Quotas**, lower each per-day quota to the monthly free allowance divided by 31, rounded down. For example, 161 Place Details requests a day stays under the 5,000 a month. Requests fail for the rest of the day once a limit is reached, and limits reset at midnight Pacific time. Quotas stop usage. Budget alerts only warn you.
5. Optional: create a Map ID under **Google Maps Platform > Map Management**. The app uses Google's testing ID if you skip this.

## 2. Firebase (sync, sign-in, hosting)

Use a separate project from step 1 and stay on the free Spark plan, which has no card and can't bill you.

1. In the [Firebase console](https://console.firebase.google.com/), create a project.
2. **Authentication > Sign-in method:** enable **Google**. Under **Settings > Authorized domains**, make sure `localhost` is listed if you want to sign in during local testing.
3. **Firestore Database:** create a database in production mode.
4. **Project settings > Your apps:** add a Web app and copy its config values.

## 3. Add the keys

Copy `.env.example` to `.env.local` and fill it in. `.env.local` is ignored by git.

| .env.local | Where it comes from |
|---|---|
| `VITE_GOOGLE_MAPS_API_KEY` | The key from step 1 |
| `VITE_GOOGLE_MAPS_MAP_ID` | Optional Map ID from step 1 |
| `VITE_FIREBASE_API_KEY` | `apiKey` in the Firebase config |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_APP_ID` | `appId` |

## 4. Publish it

```bash
npm run build
```

```bash
npx firebase-tools login
```

```bash
npx firebase-tools deploy --only hosting,firestore:rules --project YOUR-FIREBASE-PROJECT
```

Deploying the rules is what limits each account to its own trips. Your app is then at `https://YOUR-FIREBASE-PROJECT.web.app`.

## 5. Put it on your phone

Open that address in Chrome on Android, sign in, then choose **Add to Home screen** or **Install app** from the menu.

## 6. Gemini suggestions

These use the free Gemini tier through your Firebase project, with no card. Suggestions send the city and your interests. Background scoring sends each place's name and area, one request per place, and saves the result so each place is scored once. Google may use what's sent to improve its products. Sending place names from Google Maps to free Gemini goes against the Google Maps Platform terms, a risk accepted for this personal project.

1. In the Firebase console, open **AI Services > AI Logic**, click **Get started**, and choose the **Gemini Developer API**.
2. In [Google Cloud reCAPTCHA](https://console.cloud.google.com/security/recaptcha), with your Firebase project selected, enable the API if asked and create a **Web** key. Add the domains `YOUR-FIREBASE-PROJECT.web.app` and `YOUR-FIREBASE-PROJECT.firebaseapp.com`. Leave the checkbox challenge off, and never add `localhost`.
3. In the Firebase console, open **Security > App Check > Apps**, register your web app with **reCAPTCHA Enterprise**, and paste in the key.
4. Add the same key to `.env.local` as `VITE_RECAPTCHA_SITE_KEY`, then publish again.

To test locally, run `npm run dev`, open the browser console after clicking **Get ideas**, and add the printed debug token under **App Check > Apps > ⋮ > Manage debug tokens**. Keep that token private.

## Good to know

- Google's terms allow keeping place IDs but generally not names, addresses, coordinates or photos, so those load fresh each time. Notes are your own and stay readable without signal.
- Each trip syncs as one record. If both devices edit the same trip while offline, the one that reconnects last replaces the other's changes to that trip.
- Trips in demo mode stay in that browser and don't move to your account.
