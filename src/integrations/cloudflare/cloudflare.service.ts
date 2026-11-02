import { cloudflareClient } from './cloudflare.client.js';
import type { TurnstileVerifyResult } from './cloudflare.types.js';

export const cloudflareService = {
  verifyTurnstile: async function (token: string | undefined): Promise<TurnstileVerifyResult> {
        if (!token || typeof token !== 'string') {
            return { ok: false, reason: 'missing-token' };
        }

        try {
            const data = await cloudflareClient.verifyToken(token);

            if (!data.success) {
                return {
                    ok: false,
                    reason: 'cloudflare-rejected',
                    errorCodes: data['error-codes'],
                };
            }

            // Optional extra checks (recommended in production):
            // if (data.hostname !== env.TURNSTILE_EXPECTED_HOSTNAME) return { ok: false, reason: 'hostname-mismatch' };
            // if (data.action !== 'login') return { ok: false, reason: 'action-mismatch' };
            return { ok: true };
        } catch {
            // Fail closed: if Cloudflare is unreachable, do not allow login.
            return { ok: false, reason: 'verification-unavailable' };
        }
    },
};