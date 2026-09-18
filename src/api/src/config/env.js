import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env variables from root or api directory
dotenv.config({ path: path.join(__dirname, '../../../.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config();

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
export const JWT_SECRET = process.env.JWT_SECRET || 'default_fallback_secret';
export const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/app_database';

export const config = {
  geminiApiKey: GEMINI_API_KEY,
  jwtSecret: JWT_SECRET,
  mongoUri: MONGO_URI,
};

export default config;
