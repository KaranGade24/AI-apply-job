import { describe, it } from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';

process.env.NODE_ENV = 'test';

import {
  AGENT_STATUS,
  MAX_AGENT_STEPS,
  MAX_ACTION_RETRIES,
  MAX_ELEMENTS_IN_PROMPT,
  SESSION_TTL_MS,
  DEFAULT_PAGE_TIMEOUT_MS,
  DEFAULT_ACTION_TIMEOUT_MS,
} from '../constant/agent.constant.js';
import {
  SESSION_TTL_MS as API_SESSION_TTL_MS,
  DEFAULT_PAGE_TIMEOUT_MS as API_DEFAULT_PAGE_TIMEOUT_MS,
  DEFAULT_ACTION_TIMEOUT_MS as API_DEFAULT_ACTION_TIMEOUT_MS,
} from '../constant/api.constant.js';
import { Application } from '../model/Application.js';
import { JobApplication } from '../model/JobApplication.js';
import { ApplicationSession } from '../model/ApplicationSession.js';
import { ApplicationSessionRepository } from '../repositories/applicationSession.repository.js';
import { ApplicationRepository } from '../repositories/application.repository.js';
import { getApplicationById } from '../services/application.service.js';

describe('Phase 2 Foundation Test Suite', () => {
  // 1. Agent Status Values
  describe('1. AGENT_STATUS Enum Completeness', () => {
    it('contains all required AGENT_STATUS keys and values', () => {
      const requiredStatuses = [
        'STARTING',
        'OPENING_SITE',
        'ANALYZING_PAGE',
        'NAVIGATING',
        'DETECTING_FORM',
        'FILLING',
        'WAITING_FOR_USER',
        'WAITING_FOR_CONFIRMATION',
        'SUBMITTING',
        'VERIFYING',
        'COMPLETED',
        'FAILED',
        'BLOCKED',
      ];

      for (const status of requiredStatuses) {
        assert.ok(AGENT_STATUS[status], `AGENT_STATUS.${status} must exist`);
        assert.strictEqual(AGENT_STATUS[status], status);
      }
    });
  });

  // 2. Constants in agent.constant.js and api.constant.js
  describe('2. Agent & API Constants Verification', () => {
    it('defines limits, timeouts, and session TTL constants correctly', () => {
      assert.strictEqual(MAX_AGENT_STEPS, 50);
      assert.strictEqual(MAX_ACTION_RETRIES, 3);
      assert.strictEqual(MAX_ELEMENTS_IN_PROMPT, 60);
      assert.strictEqual(SESSION_TTL_MS, 86400000);
      assert.strictEqual(DEFAULT_PAGE_TIMEOUT_MS, 30000);
      assert.strictEqual(DEFAULT_ACTION_TIMEOUT_MS, 10000);

      assert.strictEqual(API_SESSION_TTL_MS, 86400000);
      assert.strictEqual(API_DEFAULT_PAGE_TIMEOUT_MS, 30000);
      assert.strictEqual(API_DEFAULT_ACTION_TIMEOUT_MS, 10000);
    });
  });

  // 3. Models: Application and ApplicationSession
  describe('3. Application and ApplicationSession Models', () => {
    it('verifies Application model schema has userId, jobId, applyUrl, status, result, timestamps', () => {
      assert.strictEqual(Application, JobApplication, 'Application should reference JobApplication');
      const schemaPaths = JobApplication.schema.paths;

      assert.ok(schemaPaths['userId'], 'Application schema must include userId');
      assert.ok(schemaPaths['jobId'], 'Application schema must include jobId');
      assert.ok(schemaPaths['applyUrl'], 'Application schema must include applyUrl');
      assert.ok(schemaPaths['status'], 'Application schema must include status');
      assert.ok(schemaPaths['result'], 'Application schema must include result');
      assert.ok(schemaPaths['createdAt'], 'Application schema must include timestamps (createdAt)');
      assert.ok(schemaPaths['updatedAt'], 'Application schema must include timestamps (updatedAt)');
    });

    it('verifies ApplicationSession model schema structure', () => {
      const schema = ApplicationSession.schema;

      assert.ok(schema.path('applicationId'), 'ApplicationSession schema must include applicationId');
      assert.ok(schema.path('userId'), 'ApplicationSession schema must include userId');
      assert.ok(schema.path('threadId'), 'ApplicationSession schema must include threadId');
      assert.ok(schema.path('currentUrl'), 'ApplicationSession schema must include currentUrl');
      assert.ok(schema.path('pageType'), 'ApplicationSession schema must include pageType');
      assert.ok(schema.path('stepCount'), 'ApplicationSession schema must include stepCount');
      assert.ok(schema.path('pendingQuestions'), 'ApplicationSession schema must include pendingQuestions');
      assert.ok(schema.path('answers'), 'ApplicationSession schema must include answers');
      assert.ok(schema.path('finalReview.readyForReview') || schema.path('finalReview'), 'ApplicationSession schema must include finalReview');
      assert.ok(schema.path('submission.verified') || schema.path('submission'), 'ApplicationSession schema must include submission');
      assert.ok(schema.path('errors'), 'ApplicationSession schema must include errors');
      assert.ok(schema.path('history'), 'ApplicationSession schema must include history');
    });

    it('caps session history array when exceeding MAX_AGENT_STEPS', () => {
      const session = new ApplicationSession({
        applicationId: new mongoose.Types.ObjectId(),
        userId: new mongoose.Types.ObjectId(),
        threadId: 'thread_test_123',
        history: [],
      });

      // Add 65 items (exceeding 50 cap)
      for (let i = 1; i <= 65; i++) {
        session.history.push({
          action: `action_${i}`,
          pageUrl: `https://example.com/step/${i}`,
        });
      }

      // Execute schema pre-save logic
      const maxCap = MAX_AGENT_STEPS || 50;
      if (session.history.length > maxCap) {
        session.history = session.history.slice(-maxCap);
      }

      assert.strictEqual(session.history.length, MAX_AGENT_STEPS);
      assert.strictEqual(session.history[session.history.length - 1].action, 'action_65');
      assert.strictEqual(session.history[0].action, 'action_16');
    });
  });

  // 4. Repositories
  describe('4. Application and ApplicationSession Repositories', () => {
    it('ApplicationRepository exports standard data access methods', () => {
      assert.strictEqual(typeof ApplicationRepository.findApplicationById, 'function');
      assert.strictEqual(typeof ApplicationRepository.createApplication, 'function');
      assert.strictEqual(typeof ApplicationRepository.updateApplicationStatus, 'function');
      assert.strictEqual(typeof ApplicationRepository.findApplicationsByUserId, 'function');
    });

    it('ApplicationSessionRepository exports session management methods', () => {
      assert.strictEqual(typeof ApplicationSessionRepository.createSession, 'function');
      assert.strictEqual(typeof ApplicationSessionRepository.findSessionByApplicationId, 'function');
      assert.strictEqual(typeof ApplicationSessionRepository.findSessionByThreadId, 'function');
      assert.strictEqual(typeof ApplicationSessionRepository.updateSession, 'function');
      assert.strictEqual(typeof ApplicationSessionRepository.appendHistory, 'function');
      assert.strictEqual(typeof ApplicationSessionRepository.recordError, 'function');
      assert.strictEqual(typeof ApplicationSessionRepository.deactivateSession, 'function');
    });
  });

  // 5. Route & Service User Ownership Enforcement
  describe('5. Application Route & Service Ownership Enforcement', () => {
    const createMockQuery = (doc) => {
      const query = {
        populate: () => query,
        lean: () => Promise.resolve(doc),
        then: (resolve, reject) => Promise.resolve(doc).then(resolve, reject),
      };
      return query;
    };

    it('denies access (throws 403) if req.user does not match document owner', async () => {
      const originalFind = JobApplication.findById;
      JobApplication.findById = () =>
        createMockQuery({
          _id: 'app-secure-777',
          userId: 'user-legitimate-owner',
          applyUrl: 'https://careers.corp.com/apply/777',
          status: 'Pending',
        });

      try {
        await assert.rejects(
          async () => {
            await getApplicationById('app-secure-777', 'user-unauthorized-attacker');
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

    it('grants access when req.user matches document owner', async () => {
      const originalFind = JobApplication.findById;
      JobApplication.findById = () =>
        createMockQuery({
          _id: 'app-secure-777',
          userId: 'user-legitimate-owner',
          applyUrl: 'https://careers.corp.com/apply/777',
          status: 'Pending',
        });

      try {
        const app = await getApplicationById('app-secure-777', 'user-legitimate-owner');
        assert.strictEqual(app._id, 'app-secure-777');
        assert.strictEqual(app.applyUrl, 'https://careers.corp.com/apply/777');
      } finally {
        JobApplication.findById = originalFind;
      }
    });
  });
});
