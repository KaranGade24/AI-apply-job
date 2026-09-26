import crypto from 'crypto';
import { ENCRYPTION_KEY } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 16;

/**
 * Derives a 32-byte key from the environment secret for AES-256
 * @returns {Buffer}
 */
const deriveKey = () => {
  const secret = ENCRYPTION_KEY || 'default-fallback-aes-256-gcm-key-32b';
  return crypto.createHash('sha256').update(secret).digest();
};

/**
 * Encrypts a string value using AES-256-GCM
 * @param {string} plainText
 * @returns {{ algorithm: string, iv: string, authTag: string, cipherText: string }}
 */
export const encryptValue = (plainText) => {
  if (typeof plainText !== 'string') {
    plainText = JSON.stringify(plainText);
  }

  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let cipherText = cipher.update(plainText, 'utf8', 'hex');
  cipherText += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');

  return {
    algorithm: ALGORITHM,
    iv: iv.toString('hex'),
    authTag,
    cipherText
  };
};

/**
 * Decrypts an AES-256-GCM encrypted payload back to plain text string
 * @param {{ algorithm?: string, iv: string, authTag: string, cipherText: string }} encryptedObj
 * @returns {string} Decrypted plain text
 */
export const decryptValue = (encryptedObj) => {
  if (!encryptedObj || !encryptedObj.cipherText || !encryptedObj.iv || !encryptedObj.authTag) {
    throw new Error('Invalid encrypted object payload. Missing cipherText, iv, or authTag.');
  }

  const key = deriveKey();
  const iv = Buffer.from(encryptedObj.iv, 'hex');
  const authTag = Buffer.from(encryptedObj.authTag, 'hex');

  const decipher = crypto.createDecipheriv(encryptedObj.algorithm || ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedObj.cipherText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

export default {
  encryptValue,
  decryptValue
};
