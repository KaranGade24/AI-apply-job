/**
 * General API Constants (Excluding Agent)
 */
export const DEFAULT_PORT = process.env.API_PORT || 5000;
export const JWT_EXPIRES_IN = '24h';
export const BCRYPT_SALT_ROUNDS = 10;

// File Upload Limits and Constraints
export const MAX_FILE_SIZE_MB = 5;
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB strictly

export const TEMP_UPLOAD_DIR_NAME = 'resume_temp';

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
];

export const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt'];

// Session and Timeouts
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const DEFAULT_PAGE_TIMEOUT_MS = 30000;
export const DEFAULT_ACTION_TIMEOUT_MS = 10000;

