import type { FingerprintEvent } from '../../integrations/fingerprint/fingerprint.types.js';
import type { ClientInfo } from '../../utils/request.js';

// Request fields are always stored; Fingerprint fields only when the event was found.
export const toLoginEventData = (event: FingerprintEvent | null, client: ClientInfo) => {
  const request = { requestIp: client.ipAddress, userAgent: client.userAgent };
  if (!event) return request;

  const geo = (event.ip_info?.v4 ?? event.ip_info?.v6)?.geolocation;

  return {
    ...request,
    eventId: event.event_id,
    visitorId: event.identification.visitor_id,
    fingerprintIp: event.ip_address,
    os: event.os,
    browserName: event.browser_details.browser_name,
    countryCode: geo?.country_code,
    city: geo?.city_name,
    latitude: geo?.latitude,
    longitude: geo?.longitude,
    browserDetails: event.browser_details,
    ipInfo: event.ip_info,
  };
};
