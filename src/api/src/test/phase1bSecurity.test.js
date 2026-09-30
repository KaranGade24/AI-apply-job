import { describe, it } from 'node:test';
import assert from 'node:assert';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';

import { JWT_SECRET } from '../config/env.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { encryptValue, decryptValue } from '../utils/encryption.js';
import { BrowserSessionRepository } from '../repositories/browserSession.repository.js';
import { getApplicationById, updateApplicationStatusDirectService } from '../services/application.service.js';
import { JobApplication } from '../model/JobApplication.js';

// Helper to mock Mongoose findById chain with .populate()
const createMockQuery = (doc) => {
  const query = {
    populate: () => query,
    lean: () => Promise.resolve(doc),
    then: (resolve, reject) => Promise.resolve(doc).then(resolve, reject),
  };
  return query;
};

describe('Phase 1B Security & Hygiene Suite', () => {
  const validToken = jwt.sign({ userId: 'user-valid-1', email: 'test@example.com' }, JWT_SECRET);

  // Test (a): query/body tokens are rejected
  describe('Test (a): authMiddleware rejects query/body tokens and requires Authorization header', () => {
    it('rejects token passed in query parameter', () => {
      let statusCode = null;
      let errorResponse = null;
      let nextCalled = false;

      const req = {
        headers: {},
        query: { token: validToken },
      };
      const res = {
        status: (code) => {
          statusCode = code;
          return {
            json: (data) => {
              errorResponse = data;
            },
          };
        },
      };
      const next = () => {
        nextCalled = true;
      };

      authMiddleware(req, res, next);

      assert.strictEqual(nextCalled, false, 'next() should not be called');
      assert.strictEqual(statusCode, 401, 'Should return status 401');
      assert.match(errorResponse?.message || '', /Authorization header/);
    });

    it('rejects token passed in body', () => {
      let statusCode = null;
      let errorResponse = null;
      let nextCalled = false;

      const req = {
        headers: {},
        body: { token: validToken },
      };
      const res = {
        status: (code) => {
          statusCode = code;
          return {
            json: (data) => {
              errorResponse = data;
            },
          };
        },
      };
      const next = () => {
        nextCalled = true;
      };

      authMiddleware(req, res, next);

      assert.strictEqual(nextCalled, false, 'next() should not be called');
      assert.strictEqual(statusCode, 401, 'Should return status 401');
      assert.match(errorResponse?.message || '', /Authorization header/);
    });

    it('accepts valid token passed in Authorization: Bearer header', () => {
      let nextCalled = false;
      const req = {
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      };
      const res = {
        status: () => ({ json: () => {} }),
      };
      const next = () => {
        nextCalled = true;
      };

      authMiddleware(req, res, next);

      assert.strictEqual(nextCalled, true, 'next() should be called');
      assert.strictEqual(req.user?.userId, 'user-valid-1');
    });
  });

  // Test (b): isUserAuthorized denies missing ids
  describe('Test (b): isUserAuthorized denies missing ids', () => {
    it('denies when docUserId is missing or null', async () => {
      const originalFind = JobApplication.findById;
      JobApplication.findById = () => createMockQuery({ _id: 'app-1', userId: null });

      try {
        await assert.rejects(
          async () => {
            await getApplicationById('app-1', 'user-123');
          },
          (err) => {
            assert.strictEqual(err.statusCode, 403);
            return true;
          }
        );
      } finally {
        JobApplication.findById = originalFind;
      }
    });

    it('denies when reqUserId is missing or null', async () => {
      const originalFind = JobApplication.findById;
      JobApplication.findById = () => createMockQuery({ _id: 'app-1', userId: 'user-123' });

      try {
        await assert.rejects(
          async () => {
            await getApplicationById('app-1', null);
          },
          (err) => {
            assert.strictEqual(err.statusCode, 403);
            return true;
          }
        );
      } finally {
        JobApplication.findById = originalFind;
      }
    });

    it('denies when user IDs do not match', async () => {
      const originalFind = JobApplication.findById;
      JobApplication.findById = () => createMockQuery({ _id: 'app-1', userId: 'owner-id' });

      try {
        await assert.rejects(
          async () => {
            await getApplicationById('app-1', 'attacker-id');
          },
          (err) => {
            assert.strictEqual(err.statusCode, 403);
            return true;
          }
        );
      } finally {
        JobApplication.findById = originalFind;
      }
    });

    it('allows access when user IDs match', async () => {
      const originalFind = JobApplication.findById;
      JobApplication.findById = () => createMockQuery({ _id: 'app-1', userId: 'owner-id' });

      try {
        const app = await getApplicationById('app-1', 'owner-id');
        assert.strictEqual(app._id, 'app-1');
      } finally {
        JobApplication.findById = originalFind;
      }
    });
  });

  // Test (c): encrypt/decrypt round trip and legacy plaintext load
  describe('Test (c): encrypt/decrypt round trip and legacy plaintext load', () => {
    it('correctly encrypts and decrypts state with AES-256-GCM', () => {
      const rawState = {
        cookies: [{ name: 'session_id', value: 'secret-session-abc' }],
        origins: [{ origin: 'https://example.com', localStorage: [{ name: 'token', value: 'xyz' }] }],
      };

      const encrypted = encryptValue(JSON.stringify(rawState));
      assert.ok(encrypted.cipherText, 'Should contain cipherText');
      assert.ok(encrypted.iv, 'Should contain iv');
      assert.ok(encrypted.authTag, 'Should contain authTag');
      assert.strictEqual(encrypted.cipherText.includes('secret-session-abc'), false);

      const decrypted = decryptValue(encrypted);
      const parsed = JSON.parse(decrypted);
      assert.deepStrictEqual(parsed, rawState);
    });

    it('loads and decrypts encrypted storageState in BrowserSessionRepository', () => {
      const rawState = { sessionKey: 'session-val-123' };
      const encrypted = BrowserSessionRepository.encryptStorageState(rawState);

      const loaded = BrowserSessionRepository.decryptStorageState(encrypted);
      assert.deepStrictEqual(loaded, rawState);
    });

    it('tolerates and loads legacy plaintext storageState objects without crashing', () => {
      const legacyObject = {
        cookies: [{ name: 'legacy_cookie', value: 'plain_val' }],
      };

      const loaded = BrowserSessionRepository.decryptStorageState(legacyObject);
      assert.deepStrictEqual(loaded, legacyObject);
    });

    it('tolerates and loads legacy plaintext JSON string without crashing', () => {
      const legacyJson = JSON.stringify({ key: 'legacy_value' });
      const loaded = BrowserSessionRepository.decryptStorageState(legacyJson);
      assert.deepStrictEqual(loaded, { key: 'legacy_value' });
    });
  });

  // Test (d): status endpoint updates with the correct arguments (userId, id, status)
  describe('Test (d): updateApplicationStatusDirectService requires userId and updates correctly', () => {
    it('rejects with 403 when wrong userId is passed to updateApplicationStatusDirectService', async () => {
      const originalFind = JobApplication.findById;
      JobApplication.findById = () => createMockQuery({ _id: 'app-99', userId: 'user-actual-owner', status: 'pending' });

      try {
        await assert.rejects(
          async () => {
            await updateApplicationStatusDirectService('unauthorized-user', 'app-99', 'approved');
          },
          (err) => {
            assert.strictEqual(err.statusCode, 403);
            return true;
          }
        );
      } finally {
        JobApplication.findById = originalFind;
      }
    });

    it('rejects invalid status values even for authorized user', async () => {
      const originalFind = JobApplication.findById;
      JobApplication.findById = () => createMockQuery({ _id: 'app-99', userId: 'owner-1', status: 'pending' });

      try {
        await assert.rejects(
          async () => {
            await updateApplicationStatusDirectService('owner-1', 'app-99', 'non_existent_status');
          },
          (err) => {
            assert.strictEqual(err.statusCode, 400);
            return true;
          }
        );
      } finally {
        JobApplication.findById = originalFind;
      }
    });
  });

  // Test (e): another user's application returns 403
  describe("Test (e): another user's application returns 403", () => {
    it("returns 403 when requesting another user's application by ID", async () => {
      const originalFind = JobApplication.findById;
      JobApplication.findById = () => createMockQuery({
        _id: 'app-secret-123',
        userId: 'user-alice',
        company: 'Acme Corp',
      });

      try {
        await assert.rejects(
          async () => {
            await getApplicationById('app-secret-123', 'user-bob');
          },
          (err) => {
            assert.strictEqual(err.statusCode, 403);
            assert.match(err.message, /Unauthorized access/);
            return true;
          }
        );
      } finally {
        JobApplication.findById = originalFind;
      }
    });
  });
});
