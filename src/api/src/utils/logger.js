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
 * Sanitizes and redacts sensitive data (cookies, passwords, tokens, storageState) from logs.
 *
 * @param {string|object} input
 * @returns {string} Sanitized string
 */
export const sanitizeSecrets = (input) => {
  if (!input) return '';
  const text = typeof input === 'object' ? JSON.stringify(input) : String(input);

  return text
    // Redact passwords
    .replace(/(['"]?password['"]?\s*[:=]\s*['"])([^'"]+)(['"])/gi, '$1[REDACTED_PASSWORD]$3')
    // Redact authorization tokens & JWTs
    .replace(/(['"]?authorization['"]?\s*[:=]\s*['"])([^'"]+)(['"])/gi, '$1[REDACTED_TOKEN]$3')
    .replace(/bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED_TOKEN]')
    // Redact cookies & storageState
    .replace(/(['"]?cookie['"]?\s*[:=]\s*['"])([^'"]+)(['"])/gi, '$1[REDACTED_COOKIE]$3')
    .replace(/["']?storageState["']?\s*[:=]\s*(\{[^}]+\}|"[^"]+"|\'[^\']+\})/gi, 'storageState="[REDACTED_STORAGE_STATE]"')
    // Redact API keys
    .replace(/AIzaSy[a-zA-Z0-9_\-_]{33}/g, '[REDACTED_API_KEY]');
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
