import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { config } from '../config';

/** AES-256-GCM: authenticated encryption, so tampered files fail to decrypt. */
export function encryptBuffer(plain: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', config.fileKey, iv);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { data, iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex') };
}

export function decryptBuffer(data: Buffer, ivHex: string, tagHex: string): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', config.fileKey, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(data), decipher.final()]);
}
