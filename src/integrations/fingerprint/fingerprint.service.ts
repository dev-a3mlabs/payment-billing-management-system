import { fingerprintClient } from './fingerprint.client.js';

export const fingerprintService = {
  // Null when the eventId is unknown to Fingerprint.
  getEvent: (eventId: string) => fingerprintClient.getEvent(eventId),
};
