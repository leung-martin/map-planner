import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from 'firebase/ai';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { recaptchaSiteKey } from '../config';
import { buildPrompt, parseIdeas, type PlaceIdea } from '../suggest';
import { app } from './firebase';

if (import.meta.env.DEV) {
  // Prints a token to the console, which is registered in Firebase to allow localhost.
  (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}
if (recaptchaSiteKey) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

const model = getGenerativeModel(getAI(app, { backend: new GoogleAIBackend() }), {
  model: 'gemini-3.8-flash',
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: Schema.object({
      properties: {
        ideas: Schema.array({
          items: Schema.object({ properties: { name: Schema.string(), why: Schema.string() } }),
        }),
      },
    }),
  },
});

export async function suggestPlaces(city: string, interests: string): Promise<PlaceIdea[]> {
  const result = await model.generateContent(buildPrompt(city, interests));
  return parseIdeas(result.response.text());
}
