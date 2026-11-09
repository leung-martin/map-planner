import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from 'firebase/ai';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { recaptchaSiteKey } from '../config';
import { buildScorePrompt, parseScores, type PlaceToScore } from '../scoring';
import { buildPrompt, parseIdeas, withFallback, type PlaceIdea } from '../suggest';
import type { Bounds, PlaceScores } from '../types';
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

const ai = getAI(app, { backend: new GoogleAIBackend() });

const ideasConfig = {
  responseMimeType: 'application/json',
  responseSchema: Schema.object({
    properties: {
      ideas: Schema.array({
        items: Schema.object({ properties: { name: Schema.string(), why: Schema.string() } }),
      }),
    },
  }),
};

const ideasModel = getGenerativeModel(ai, { model: 'gemini-3.8-flash', generationConfig: ideasConfig });
const ideasFallbackModel = getGenerativeModel(ai, { model: 'gemini-3.5-flash-lite', generationConfig: ideasConfig });

// The lighter model, since every saved place makes one request.
const scoringModel = getGenerativeModel(ai, {
  model: 'gemini-3.5-flash-lite',
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: Schema.object({
      properties: {
        visual: Schema.integer(),
        entertainment: Schema.integer(),
        shopping: Schema.integer(),
        culture: Schema.integer(),
      },
    }),
  },
});

export async function scorePlace(place: PlaceToScore): Promise<PlaceScores> {
  const result = await scoringModel.generateContent(buildScorePrompt(place));
  return parseScores(result.response.text());
}

export async function suggestPlaces(trip: string, interests: string, area: Bounds): Promise<PlaceIdea[]> {
  const prompt = buildPrompt(trip, interests, area);
  const result = await withFallback(
    () => ideasModel.generateContent(prompt),
    () => ideasFallbackModel.generateContent(prompt),
  );
  return parseIdeas(result.response.text());
}
