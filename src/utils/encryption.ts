import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

const KEY = Buffer.from(env.MFA_ENCRYPTION_KEY, 'hex');

// AES-256-GCM; the stored text is iv.authTag.ciphertext, each part base64url.
export const encrypt = (text: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);

  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
};

export const decrypt = (payload: string) => {
  const [iv, authTag, encrypted] = payload.split('.').map((part) => Buffer.from(part, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
};
