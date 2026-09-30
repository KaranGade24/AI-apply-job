import { describe, it } from 'node:test';
import assert from 'node:assert';
import { sanitizeSecrets } from '../utils/logger.js';

describe('sanitizeSecrets Unit Test Suite', () => {
  // 1. otpCode (and otp\w* with numeric and string values)
  describe('1. otpCode and otp\\w* redaction', () => {
    it('redacts numeric otpCode', () => {
      const payload = { otpCode: 492019 };
      const sanitized = sanitizeSecrets(payload);
      assert.strictEqual(sanitized.includes('492019'), false, 'Should not contain plaintext OTP number');
      assert.match(sanitized, /\[REDACTED_OTP\]/);

      const parsed = JSON.parse(sanitized);
      assert.strictEqual(parsed.otpCode, '[REDACTED_OTP]');
    });

    it('redacts otp_code and oneTimeCode string values', () => {
      const payload = { otp_code: '849201', oneTimeCode: '123456' };
      const sanitized = sanitizeSecrets(payload);
      assert.strictEqual(sanitized.includes('849201'), false);
      assert.strictEqual(sanitized.includes('123456'), false);

      const parsed = JSON.parse(sanitized);
      assert.strictEqual(parsed.otp_code, '[REDACTED_OTP]');
      assert.strictEqual(parsed.oneTimeCode, '[REDACTED_OTP]');
    });

    it('redacts numeric otpCode from raw string input without parsing error', () => {
      const rawString = 'Failed login with otpCode: 987654 for user';
      const sanitized = sanitizeSecrets(rawString);
      assert.strictEqual(sanitized.includes('987654'), false);
      assert.match(sanitized, /\[REDACTED_OTP\]/);
    });
  });

  // 2. nested storageState
  describe('2. nested storageState redaction without trailing brackets', () => {
    it('redacts complex nested storageState from object and produces valid JSON', () => {
      const payload = {
        applicationId: 'app-12345',
        workflow: {
          step: 2,
          storageState: {
            cookies: [
              { name: 'session_id', value: 'secret-token-123', domain: 'example.com' },
              { name: 'auth_jwt', value: 'secret-jwt-456', domain: 'example.com' },
            ],
            origins: [
              {
                origin: 'https://example.com',
                localStorage: [{ name: 'persist:root', value: 'sensitive-store-data' }],
              },
            ],
          },
        },
      };

      const sanitized = sanitizeSecrets(payload);
      assert.strictEqual(sanitized.includes('secret-token-123'), false);
      assert.strictEqual(sanitized.includes('sensitive-store-data'), false);

      // Must be valid JSON with NO trailing brackets or syntax corruption
      const parsed = JSON.parse(sanitized);
      assert.strictEqual(parsed.applicationId, 'app-12345');
      assert.strictEqual(parsed.workflow.storageState, '[REDACTED_STORAGE_STATE]');
    });

    it('redacts nested storageState from JSON string input without trailing brackets', () => {
      const rawJsonString = JSON.stringify({
        status: 'pending',
        storageState: {
          cookies: [{ name: 'sec', value: '12345' }],
          nestedDeep: { deeper: { key: 'val' } },
        },
        otherInfo: 'safe',
      });

      const sanitized = sanitizeSecrets(rawJsonString);
      assert.strictEqual(sanitized.includes('12345'), false);

      const parsed = JSON.parse(sanitized);
      assert.strictEqual(parsed.otherInfo, 'safe');
      assert.strictEqual(parsed.storageState, '[REDACTED_STORAGE_STATE]');
    });
  });

  // 3. cookies array
  describe('3. cookies array redaction', () => {
    it('redacts cookies array in structured payload', () => {
      const payload = {
        user: 'test_candidate',
        cookies: [
          { name: 'session', value: 'super-secret-cookie-val-999' },
          { name: 'xsrf', value: 'csrf-secret-token' },
        ],
      };

      const sanitized = sanitizeSecrets(payload);
      assert.strictEqual(sanitized.includes('super-secret-cookie-val-999'), false);
      assert.strictEqual(sanitized.includes('csrf-secret-token'), false);

      const parsed = JSON.parse(sanitized);
      assert.strictEqual(parsed.cookies, '[REDACTED_COOKIES]');
    });
  });

  // 4. password
  describe('4. password redaction', () => {
    it('redacts password field in object', () => {
      const payload = {
        email: 'user@example.com',
        password: 'UltraSecretPassword123!',
      };

      const sanitized = sanitizeSecrets(payload);
      assert.strictEqual(sanitized.includes('UltraSecretPassword123!'), false);

      const parsed = JSON.parse(sanitized);
      assert.strictEqual(parsed.password, '[REDACTED_PASSWORD]');
    });

    it('redacts password from plain non-JSON string', () => {
      const logMsg = 'User attempted login with password="PlainPassword999"';
      const sanitized = sanitizeSecrets(logMsg);
      assert.strictEqual(sanitized.includes('PlainPassword999'), false);
      assert.match(sanitized, /\[REDACTED_PASSWORD\]/);
    });
  });

  // 5. apiKey
  describe('5. apiKey redaction', () => {
    it('redacts apiKey field in object', () => {
      const payload = {
        service: 'gemini',
        apiKey: 'AIzaSyA8_mock_sensitive_key_9999999',
      };

      const sanitized = sanitizeSecrets(payload);
      assert.strictEqual(sanitized.includes('AIzaSyA8_mock_sensitive_key_9999999'), false);

      const parsed = JSON.parse(sanitized);
      assert.strictEqual(parsed.apiKey, '[REDACTED_API_KEY]');
    });

    it('redacts inline Google API key pattern from string', () => {
      const logMsg = 'Calling endpoint with key AIzaSyD9481234567890123456789012345';
      const sanitized = sanitizeSecrets(logMsg);
      assert.strictEqual(sanitized.includes('AIzaSyD9481234567890123456789012345'), false);
      assert.match(sanitized, /\[REDACTED_API_KEY\]/);
    });
  });
});
