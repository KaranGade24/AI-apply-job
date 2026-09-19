import express from 'express';
import { logError } from '../utils/logger.js';

/**
 * Custom JSON Parser Middleware that handles standard JSON and automatically fixes trailing commas
 */
export const flexibleJsonParser = (req, res, next) => {
  if (req.is('json')) {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      if (!data || !data.trim()) {
        req.body = {};
        return next();
      }

      try {
        // Try standard JSON parse first
        req.body = JSON.parse(data);
        return next();
      } catch (firstError) {
        try {
          // Fix trailing commas in arrays and objects using regex
          const sanitized = data.replace(/,\s*([\]}])/g, '$1');
          req.body = JSON.parse(sanitized);
          return next();
        } catch (secondError) {
          logError('flexibleJsonParser', `Failed to parse JSON body: ${secondError.message}`);
          return res.status(400).json({
            success: false,
            error: 'Invalid JSON Format',
            message: 'The request body contains malformed JSON. Please check for syntax errors or unescaped characters.'
          });
        }
      }
    });
  } else {
    next();
  }
};

export default flexibleJsonParser;
