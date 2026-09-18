import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env variables from the current directory level
dotenv.config({ path: path.join(__dirname, '../.env') });

export const config = {
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/app_database',
  jwtSecret: process.env.JWT_SECRET || 'default_fallback_secret',
};
