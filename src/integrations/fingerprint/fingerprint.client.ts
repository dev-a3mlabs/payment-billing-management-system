import axios from 'axios';
import { env } from '../../config/env.js';
import type { FingerprintEvent } from './fingerprint.types.js';

const BASE_URLS = {
  global: 'https://api.fpjs.io/v4',
  eu: 'https://eu.api.fpjs.io/v4',
  ap: 'https://ap.api.fpjs.io/v4',
} as const;

const http = axios.create({
  baseURL: BASE_URLS[env.FINGERPRINT_REGION],
  headers: { Authorization: `Bearer ${env.FINGERPRINT_SECRET_API_KEY}` },
  timeout: 10000,
});

export const fingerprintClient = {
  getEvent: async (eventId: string) => {
    try {
      const { data } = await http.get<FingerprintEvent>(`/events/${encodeURIComponent(eventId)}`);
      return data;
    } catch (err) {
      if (!axios.isAxiosError(err)) throw err;
      if (err.response?.status === 404) return null;
      // Rethrown as a plain Error so the API key in err.config never reaches the logs.
      throw new Error(`Fingerprint API request failed: ${err.response?.status ?? err.code}`);
    }
  },
};
