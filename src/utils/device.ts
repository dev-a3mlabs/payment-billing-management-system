import type { Request } from 'express';
import DeviceDetectorModule from 'node-device-detector';
import ClientHintsModule, { type JSONObject } from 'node-device-detector/client-hints.js';

// The package exports with module.exports, but its typings declare a default export.
const DeviceDetector = DeviceDetectorModule as unknown as typeof DeviceDetectorModule.default;
const ClientHints = ClientHintsModule as unknown as typeof ClientHintsModule.default;

const detector = new DeviceDetector({ maxUserAgentSize: 500, deviceIndexes: true, clientIndexes: true });
const clientHints = new ClientHints();

// The library returns '' for unknown values; they are stored as null.
const toColumn = (value: string | undefined, maxLength: number) => value?.slice(0, maxLength) || null;

export const detectDevice = (req: Request) => {
  const { client, os, device } = detector.detect(
    req.get('user-agent') ?? '',
    clientHints.parse(req.headers as JSONObject, {}),
  );

  return {
    browserName: toColumn(client.name, 50),
    browserVersion: toColumn(client.version, 20),
    os: toColumn(os.name, 50),
    osVersion: toColumn(os.version, 20),
    deviceType: toColumn(device.type, 20),
    deviceBrand: toColumn(device.brand, 50),
    deviceModel: toColumn(device.model, 50),
  };
};

export type DeviceInfo = ReturnType<typeof detectDevice>;
