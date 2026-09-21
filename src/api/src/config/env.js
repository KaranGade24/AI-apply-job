import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env variables from root or api directory
dotenv.config({ path: path.join(__dirname, '../../../.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config();

export const PORT = Number(process.env.PORT || 3000);
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
export const JWT_SECRET = process.env.JWT_SECRET || 'default_fallback_secret';
export const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/app_database';

// Browser Automation envs
export const BROWSER_HEADLESS = process.env.BROWSER_HEADLESS === 'true';
export const BROWSER_SLOW_MO = Number(process.env.BROWSER_SLOW_MO || 0);
export const BROWSER_TIMEOUT = Number(process.env.BROWSER_TIMEOUT || 30000);

// SMTP / Email Integration envs
export const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
export const SMTP_PORT = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 465;
export const SMTP_USER = process.env.SMTP_USER || 'gadekaran24@gmail.com';
export const SMTP_PASS = process.env.SMTP_PASS || '';
export const EMAIL_FROM = process.env.EMAIL_FROM || 'gadekaran24@gmail.com';

export const config = {
  port: PORT,
  geminiApiKey: GEMINI_API_KEY,
  jwtSecret: JWT_SECRET,
  mongoUri: MONGO_URI,
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
