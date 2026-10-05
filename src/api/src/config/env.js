import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { logError } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env variables from root or api directory
dotenv.config({ path: path.join(__dirname, '../../../.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config();

export const NODE_ENV = process.env.NODE_ENV || 'development';
export const PORT = Number(process.env.PORT || 3000);

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY || (NODE_ENV === 'test' ? 'test_gemini_api_key' : 'dev_gemini_api_key');
export const JWT_SECRET = process.env.JWT_SECRET || (NODE_ENV === 'test' ? 'test_jwt_secret_key_12345' : 'dev_jwt_secret_key_change_in_production_12345');
export const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || (NODE_ENV === 'test' ? 'test_encryption_key_different_54321' : 'dev_encryption_key_diff_from_jwt_secret_54321');
export const MONGO_URI = process.env.MONGO_URI || (NODE_ENV === 'test' ? 'mongodb://127.0.0.1:27017/test_db' : 'mongodb://127.0.0.1:27017/ai_apply_job');

// Validate on production environments
if (NODE_ENV === 'production') {
  const missingEnvs = [];
  if (!process.env.JWT_SECRET) missingEnvs.push('JWT_SECRET');
  if (!process.env.MONGO_URI) missingEnvs.push('MONGO_URI');
  if (!process.env.GEMINI_API_KEY && !process.env.API_KEY) missingEnvs.push('GEMINI_API_KEY');
  if (!process.env.ENCRYPTION_KEY) missingEnvs.push('ENCRYPTION_KEY');

  if (missingEnvs.length > 0) {
    const warnMsg = `Configuration Warning: Missing recommended environment variables: ${missingEnvs.join(', ')}`;
    logError('config.env', warnMsg);
    console.warn(warnMsg);
  }

  if (ENCRYPTION_KEY === JWT_SECRET) {
    const warnMsg = 'Configuration Warning: ENCRYPTION_KEY should differ from JWT_SECRET for security hygiene.';
    logError('config.env', warnMsg);
    console.warn(warnMsg);
  }
}

// Browser Automation envs
export const BROWSER_HEADLESS = process.env.BROWSER_HEADLESS !== 'false';
export const BROWSER_SLOW_MO = Number(process.env.BROWSER_SLOW_MO || 0);
export const BROWSER_TIMEOUT = Number(process.env.BROWSER_TIMEOUT || 30000);

// SMTP / Email Integration envs
export const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
export const SMTP_PORT = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 465;
export const SMTP_USER = process.env.SMTP_USER || '';
export const SMTP_PASS = process.env.SMTP_PASS || '';
export const EMAIL_FROM = process.env.EMAIL_FROM || '';

export const config = {
  env: NODE_ENV,
  port: PORT,
  geminiApiKey: GEMINI_API_KEY,
  jwtSecret: JWT_SECRET,
  mongoUri: MONGO_URI,
  encryptionKey: ENCRYPTION_KEY,
  browser: {
    headless: BROWSER_HEADLESS,
    slowMo: BROWSER_SLOW_MO,
    timeout: BROWSER_TIMEOUT,
  },
  smtp: {
    host: SMTP_HOST,
    port: SMTP_PORT,
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
  emailFrom: EMAIL_FROM,
};

export default config;
