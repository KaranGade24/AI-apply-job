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

export const logAuthEvent = async (eventType, userIdentifier, status, additionalInfo = '', mode = 'mix') => {
  try {
    const timestamp = new Date().toISOString();
    
    // Construct the text format log entry
    const formattedLog = `[${timestamp}] EVENT: ${eventType.toUpperCase()} | STATUS: ${status.toUpperCase()} | USER: ${userIdentifier} | INFO: ${additionalInfo}\n`;
    
    // Output to console if mode is console or mix
    if (mode === 'console' || mode === 'mix') {
      console.log(formattedLog.trim());
    }

    // Append to the text file if mode is file or mix
    if (mode === 'file' || mode === 'mix') {
      const logFilePath = path.join(logDirectory, 'authEvents.log');
      await fs.appendFile(logFilePath, formattedLog, 'utf8');
    }
  } catch (error) {
    // Graceful fallback if the file system fails, preventing the app from crashing
    console.error('Failed to write to auth log file:', error.message);
  }
};

export const logLoginEvent = async (userIdentifier, status, additionalInfo = '', mode = 'mix') => {
  return logAuthEvent('LOGIN', userIdentifier, status, additionalInfo, mode);
};

export const logRegisterEvent = async (userIdentifier, status, additionalInfo = '', mode = 'mix') => {
  return logAuthEvent('REGISTER', userIdentifier, status, additionalInfo, mode);
};
