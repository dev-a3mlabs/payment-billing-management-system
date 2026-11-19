import type { FingerprintEvent } from '../../integrations/fingerprint/fingerprint.types.js';
import type { ClientInfo } from '../../utils/request.js';

// Where and on which device a login happened; empty when Fingerprint has no event.
export const toLoginPlace = (event: FingerprintEvent | null) => {
  const geo = (event?.ip_info?.v4 ?? event?.ip_info?.v6)?.geolocation;

  return {
    visitorId: event?.identification.visitor_id,
    countryCode: geo?.country_code,
    city: geo?.city_name,
    latitude: geo?.latitude,
    longitude: geo?.longitude,
  };
};

export type LoginPlace = ReturnType<typeof toLoginPlace>;

// Request and device fields are always stored; Fingerprint fields only when the event was found.
export const toLoginEventData = (event: FingerprintEvent | null, client: ClientInfo) => {
  const request = { requestIp: client.ipAddress, userAgent: client.userAgent, ...client.device };
  if (!event) return request;

  return {
    ...request,
    ...toLoginPlace(event),
    eventId: event.event_id,
    fingerprintIp: event.ip_address,
    ipInfo: event.ip_info,
  };
};
