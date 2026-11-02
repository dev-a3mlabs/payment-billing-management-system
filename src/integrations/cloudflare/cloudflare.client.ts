import axios from 'axios';
import { env } from '../../config/env.js';
import type { TurnstileVerifyResponse } from './cloudflare.types.js';

const http = axios.create({
  baseURL: 'https://challenges.cloudflare.com/turnstile/v0',
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
});

export const cloudflareClient = {
  // Calls siteverify. Cloudflare answers 200 with success true/false,
  // so a rejected token comes back as data, not as an exception.
  verifyToken: async (token: string) => {
    try {
      const { data } = await http.post<TurnstileVerifyResponse>('/siteverify', { secret: env.CLOUDFLARE_SECRET_API_KEY, response: token });
      return data;
    } catch (err) {
      if (!axios.isAxiosError(err)) throw err;

      // Cloudflare can return 400 with a JSON body that has error-codes.
      // Return that body so the service can log the real reason.
      const body = err.response?.data as TurnstileVerifyResponse | undefined;
      if (body && typeof body.success === 'boolean') return body;

      // Rethrown as a plain Error so the secret in err.config never reaches the logs.
      throw new Error(`Turnstile API request failed: ${err.response?.status ?? err.code}`);
    }
  },
};