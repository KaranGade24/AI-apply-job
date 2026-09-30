import { sanitizeSecrets } from '../utils/logger.js';
import assert from 'assert';

async function runSecretRedactionTests() {
  console.log('--- STARTING SECRET REDACTION & LOG SECURITY TESTS ---');

  try {
    // 1. Password Redaction Test
    console.log('Test 1: Sanitizes passwords from logs...');
    const rawLogWithPassword = 'User login failed with password="SecretPassword123!" and username=john';
    const sanitizedPassword = sanitizeSecrets(rawLogWithPassword);
    assert.strictEqual(sanitizedPassword.includes('SecretPassword123!'), false);
    assert.ok(sanitizedPassword.includes('[REDACTED_PASSWORD]'));
    console.log('✅ Test 1 Passed.');

    // 2. Authorization Token / Bearer Redaction Test
    console.log('Test 2: Sanitizes Bearer tokens and authorization headers...');
    const rawLogWithToken = 'API request authorization="Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sub123" failed';
    const sanitizedToken = sanitizeSecrets(rawLogWithToken);
    assert.strictEqual(sanitizedToken.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), false);
    assert.ok(sanitizedToken.includes('[REDACTED_TOKEN]'));
    console.log('✅ Test 2 Passed.');

    // 3. Cookie & storageState Redaction Test
    console.log('Test 3: Sanitizes session cookies and storageState payloads...');
    const rawLogWithStorage = 'Injected storageState={"cookies":[{"name":"sessionId","value":"secretCookieVal999"}]} into context';
    const sanitizedStorage = sanitizeSecrets(rawLogWithStorage);
    assert.strictEqual(sanitizedStorage.includes('secretCookieVal999'), false);
    assert.ok(sanitizedStorage.includes('[REDACTED_STORAGE_STATE]'));
    console.log('✅ Test 3 Passed.');

    // 4. API Key Redaction Test
    console.log('Test 4: Sanitizes Google Gemini / external API keys...');
    const rawLogWithKey = 'Initialized Gemini client with apiKey=AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q';
    const sanitizedKey = sanitizeSecrets(rawLogWithKey);
    assert.strictEqual(sanitizedKey.includes('AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q'), false);
    assert.ok(sanitizedKey.includes('[REDACTED_API_KEY]'));
    console.log('✅ Test 4 Passed.');

    console.log('🎉 ALL SECRET REDACTION & LOG SECURITY TESTS PASSED SUCCESSFULLY.');
  } catch (error) {
    console.error('❌ Secret Redaction Tests Failed:', error);
    process.exit(1);
  }
}

runSecretRedactionTests();
