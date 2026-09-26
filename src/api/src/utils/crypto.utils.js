import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_SECRET || 'a_very_secure_32_bytes_key_1234!';
const KEY_BUFFER = crypto.scryptSync(ENCRYPTION_KEY, 'salt_naukri_ai', 32);

/**
 * Encrypts raw text or object into an encrypted hex string
 * @param {string|object} data
 * @returns {string} Encrypted string format: "iv:encryptedData"
 */
export const encryptData = (data) => {
  if (!data) return null;
  const text = typeof data === 'object' ? JSON.stringify(data) : String(data);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY_BUFFER, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
};

/**
 * Decrypts an encrypted hex string back into original text or JSON object
 * @param {string} encryptedString - Format "iv:encryptedData"
 * @param {boolean} isJson - Whether to parse output as JSON
 * @returns {string|object|null} Decrypted content
 */
export const decryptData = (encryptedString, isJson = false) => {
  if (!encryptedString || typeof encryptedString !== 'string') return null;
  try {
    const parts = encryptedString.split(':');
    if (parts.length !== 2) return null;
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY_BUFFER, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    if (isJson) {
      return JSON.parse(decrypted);
    }
    return decrypted;
  } catch (error) {
    return null;
  }
};
