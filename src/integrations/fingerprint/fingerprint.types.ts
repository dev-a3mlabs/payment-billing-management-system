type Velocity = {
  '5_minutes': number;
  '1_hour': number;
  '24_hours': number;
};

type IpDetails = {
  address: string;
  geolocation: {
    accuracy_radius: number;
    latitude: number;
    longitude: number;
    postal_code: string;
    timezone: string;
    city_name: string;
    country_code: string;
    country_name: string;
    continent_code: string;
    continent_name: string;
    subdivisions: { iso_code: string; name: string }[];
  };
  asn: string;
  asn_name: string;
  asn_network: string;
  asn_type: string;
  datacenter_result: boolean;
};

export type FingerprintEvent = {
  event_id: string;
  timestamp: number;
  source: string;
  environment_id: string;
  sdk: {
    platform: string;
    version: string;
    integrations?: { name: string; version: string }[];
  };
  replayed: boolean;
  identification: {
    visitor_id: string;
    confidence: { score: number; version: string };
    visitor_found: boolean;
    first_seen_at: number;
    last_seen_at: number;
  };
  url: string;
  ip_address: string;
  user_agent: string;
  device: string;
  os: string;
  os_version: string;
  browser_details: {
    browser_name: string;
    browser_major_version: string;
    browser_full_version: string;
    os: string;
    os_version: string;
    device: string;
  };

  // Smart Signals — only present when enabled on the Fingerprint plan.
  bot?: 'not_detected' | 'good' | 'bad';
  developer_tools?: boolean;
  ip_blocklist?: {
    email_spam: boolean;
    attack_source: boolean;
    tor_node: boolean;
  };
  ip_info?: {
    v4?: IpDetails;
    v6?: IpDetails;
  };
  proxy?: boolean;
  proxy_confidence?: 'low' | 'medium' | 'high';
  proxy_details?: { proxy_type: string };
  proxy_ml_score?: number;
  incognito?: boolean;
  privacy_settings?: boolean;
  suspect_score?: number;
  tampering?: boolean;
  tampering_confidence?: 'low' | 'medium' | 'high';
  tampering_ml_score?: number;
  tampering_details?: { anomaly_score: number; anti_detect_browser: boolean };
  velocity?: {
    distinct_ip: Velocity;
    distinct_country: Velocity;
    events: Velocity;
    ip_events: Velocity;
  };
  virtual_machine?: boolean;
  virtual_machine_ml_score?: number;
  vpn?: boolean;
  vpn_confidence?: 'low' | 'medium' | 'high';
  vpn_ml_score?: number;
  vpn_origin_timezone?: string;
  vpn_origin_country?: string;
  vpn_methods?: {
    timezone_mismatch: boolean;
    public_vpn: boolean;
    auxiliary_mobile: boolean;
    os_mismatch: boolean;
    relay: boolean;
    ml_prediction: boolean;
  };
  high_activity_device?: boolean;
  rare_device?: boolean;
  rare_device_percentile_bucket?: string;
};
