import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define logs directory path at the root of the project
const logDirectory = path.join(__dirname, '../../../../logs');

// Synchronously create the logs directory on initial load if it doesn't exist
try {
  if (!existsSync(logDirectory)) {
    mkdirSync(logDirectory, { recursive: true });
  }
} catch (dirError) {
  console.error('Failed to create logs directory:', dirError.message);
}

/**
 * Recursively redacts sensitive keys from an object or array.
 *
 * @param {any} item
 * @returns {any}
 */
const redactObject = (item) => {
  if (item === null || item === undefined) return item;
  if (Array.isArray(item)) {
    return item.map((element) => redactObject(element));
  }
  if (typeof item === 'object') {
    const redacted = {};
    for (const [key, value] of Object.entries(item)) {
      if (/password/i.test(key)) {
        redacted[key] = '[REDACTED_PASSWORD]';
      } else if (/^(authorization|token|jwt|accessToken|refreshToken)$/i.test(key)) {
        redacted[key] = '[REDACTED_TOKEN]';
      } else if (/^cookies?$/i.test(key)) {
        redacted[key] = '[REDACTED_COOKIES]';
      } else if (/^storageState$/i.test(key)) {
        redacted[key] = '[REDACTED_STORAGE_STATE]';
      } else if (/^(otp\w*|oneTime\w*|verificationCode)$/i.test(key)) {
        redacted[key] = '[REDACTED_OTP]';
      } else if (/^(apiKey|api_key|secretKey|secret_key)$/i.test(key)) {
        redacted[key] = '[REDACTED_API_KEY]';
      } else {
        redacted[key] = redactObject(value);
      }
    }
    return redacted;
  }
  if (typeof item === 'string') {
    return applyRegexSanitization(item);
  }
  return item;
};

/**
 * Regex-based secret redaction fallback for plain non-JSON strings.
 *
 * @param {string} text
 * @returns {string}
 */
const applyRegexSanitization = (text) => {
  return text
    // Redact passwords
    .replace(/(['"]?password['"]?\s*[:=]\s*['"])([^'"]+)(['"])/gi, '$1[REDACTED_PASSWORD]$3')
    // Redact authorization tokens & JWTs
    .replace(/(['"]?(?:authorization|token|jwt|accessToken|refreshToken)['"]?\s*[:=]\s*['"])([^'"]+)(['"])/gi, '$1[REDACTED_TOKEN]$3')
    .replace(/bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED_TOKEN]')
    // Redact cookies
    .replace(/(['"]?cookie[s]?['"]?\s*[:=]\s*['"])([^'"]+)(['"])/gi, '$1[REDACTED_COOKIE]$3')
    .replace(/(['"]?cookie[s]?['"]?\s*[:=]\s*)(\[[^\]]*\]|\{[^}]*\})/gi, '$1"[REDACTED_COOKIES]"')
    // Redact storageState
    .replace(/(['"]?storageState['"]?\s*[:=]\s*)(\{[^}]*\}|"[^"]*"|\'[^\']*\})/gi, '$1"[REDACTED_STORAGE_STATE]"')
    // Redact OTPs (matches otp\w* like otpCode, otp_code, oneTimeCode, numeric and string)
    .replace(/(['"]?(?:otp\w*|oneTime\w*|verificationCode)['"]?\s*[:=]\s*['"]?)([^'"\s,}\]]+)(['"]?)/gi, '$1[REDACTED_OTP]$3')
    // Redact API keys
    .replace(/(['"]?(?:apiKey|api_key|secretKey|secret_key)['"]?\s*[:=]\s*['"])([^'"]+)(['"])/gi, '$1[REDACTED_API_KEY]$3')
    .replace(/AIzaSy[a-zA-Z0-9_\-]{20,45}/g, '[REDACTED_API_KEY]');
};

/**
 * Sanitizes and redacts sensitive data (cookies, passwords, tokens, storageState, OTPs, API keys) from logs.
 * Parses JSON when possible to prevent leaving trailing brackets or corrupting nested structures.
 *
 * @param {string|object} input
 * @returns {string} Sanitized string
 */
export const sanitizeSecrets = (input) => {
  if (input === null || input === undefined || input === '') return '';

  if (typeof input === 'object') {
    try {
      const redacted = redactObject(input);
      return JSON.stringify(redacted);
    } catch {
      return applyRegexSanitization(String(input));
    }
  }

  const strInput = String(input);
  try {
    const trimmed = strInput.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      const parsed = JSON.parse(trimmed);
      const redacted = redactObject(parsed);
      return JSON.stringify(redacted);
    }
  } catch {
    // Fall back to regex if not valid JSON
  }

  return applyRegexSanitization(strInput);
};

export const logAuthEvent = async (eventType, userIdentifier, status, additionalInfo = '', mode = 'mix') => {
  try {
    const timestamp = new Date().toISOString();
    const sanitizedInfo = sanitizeSecrets(additionalInfo);
    
    const formattedLog = `[${timestamp}] EVENT: ${eventType.toUpperCase()} | STATUS: ${status.toUpperCase()} | USER: ${userIdentifier} | INFO: ${sanitizedInfo}\n`;
    
    if (mode === 'console' || mode === 'mix') {
      console.log(formattedLog.trim());
    }

    if (mode === 'file' || mode === 'mix') {
      const logFilePath = path.join(logDirectory, 'authEvents.log');
      await fs.appendFile(logFilePath, formattedLog, 'utf8');
    }
  } catch (error) {
    console.error('Failed to write to auth log file:', error.message);
  }
};

export const logError = async (context, errorMessage, stack = '', mode = 'mix') => {
  try {
    const timestamp = new Date().toISOString();
    const sanitizedMsg = sanitizeSecrets(errorMessage);
    const sanitizedStack = sanitizeSecrets(stack);

    const formattedLog = `[${timestamp}] ERROR | CONTEXT: ${context} | MESSAGE: ${sanitizedMsg} | STACK: ${sanitizedStack}\n`;
    
    if (mode === 'console' || mode === 'mix') {
      console.error(formattedLog.trim());
    }

    if (mode === 'file' || mode === 'mix') {
      const logFilePath = path.join(logDirectory, 'errorLogs.log');
      await fs.appendFile(logFilePath, formattedLog, 'utf8');
    }
  } catch (err) {
    console.error('Failed to write to error log file:', err.message);
  }
};

export const logResumeEvent = async (resumeIdOrFile, status, additionalInfo = '', mode = 'mix') => {
  try {
    const timestamp = new Date().toISOString();
    const sanitizedInfo = sanitizeSecrets(additionalInfo);

    const formattedLog = `[${timestamp}] RESUME_EVENT | FILE/ID: ${resumeIdOrFile} | STATUS: ${status.toUpperCase()} | INFO: ${sanitizedInfo}\n`;

    if (mode === 'console' || mode === 'mix') {
      console.log(formattedLog.trim());
    }

    if (mode === 'file' || mode === 'mix') {
      const logFilePath = path.join(logDirectory, 'resumeEvents.log');
      await fs.appendFile(logFilePath, formattedLog, 'utf8');
    }
  } catch (err) {
    console.error('Failed to write to resume log file:', err.message);
  }
};

export const logJobEvent = async (stepOrSource, status, additionalInfo = '', mode = 'mix') => {
  try {
    const timestamp = new Date().toISOString();
    const sanitizedInfo = sanitizeSecrets(additionalInfo);

    const formattedLog = `[${timestamp}] JOB_EVENT | STEP/SOURCE: ${stepOrSource} | STATUS: ${status.toUpperCase()} | INFO: ${sanitizedInfo}\n`;

    if (mode === 'console' || mode === 'mix') {
      console.log(formattedLog.trim());
    }

    if (mode === 'file' || mode === 'mix') {
      const logFilePath = path.join(logDirectory, 'jobEvents.log');
      await fs.appendFile(logFilePath, formattedLog, 'utf8');
    }
  } catch (err) {
    console.error('Failed to write to job log file:', err.message);
  }
};

export const logLoginEvent = async (userIdentifier, status, additionalInfo = '', mode = 'mix') => {
  return logAuthEvent('LOGIN', userIdentifier, status, additionalInfo, mode);
};

export const logRegisterEvent = async (userIdentifier, status, additionalInfo = '', mode = 'mix') => {
  return logAuthEvent('REGISTER', userIdentifier, status, additionalInfo, mode);
};
