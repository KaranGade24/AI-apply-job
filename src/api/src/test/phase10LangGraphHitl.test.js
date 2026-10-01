import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MemorySaver, Command } from '@langchain/langgraph';

process.env.NODE_ENV = 'test';

import { BrowserAgentStateAnnotation, submitAnswersRequestSchema, confirmReviewRequestSchema } from '../agent/schema/agentStateSchema.js';
import { createBrowserAgentGraph, computeAnswersHash } from '../agent/graph/browserAgentGraph.js';
import { MongoDBSaver } from '../agent/graph/mongoSaver.js';
import { LangGraphCheckpoint } from '../model/LangGraphCheckpoint.js';
import { AGENT_STATUS, PERCEPTION_PAGE_TYPES } from '../constant/agent.constant.js';

describe('Phase 10 LangGraph Integration & HITL Test Suite', () => {
  // Test Suite 1: State Annotation & Schemas
  describe('1. State Annotation & Request Validation', () => {
    it('validates submitAnswers request schema', () => {
      const validPayload = {
        answers: [
          { questionId: 'visa_sponsorship', answer: 'No', userConfirmed: true },
          { questionId: 'expected_salary', answer: '120000', userConfirmed: true },
        ],
      };

      const parsed = submitAnswersRequestSchema.safeParse(validPayload);
      assert.strictEqual(parsed.success, true);
      assert.strictEqual(parsed.data.answers.length, 2);

      const invalidPayload = { answers: [] };
      assert.strictEqual(submitAnswersRequestSchema.safeParse(invalidPayload).success, false);
    });

    it('validates confirmReview request schema', () => {
      const valid = { approved: true, hash: 'a1b2c3d4e5f6' };
      assert.strictEqual(confirmReviewRequestSchema.safeParse(valid).success, true);

      const invalid = { approved: false, hash: '' };
      assert.strictEqual(confirmReviewRequestSchema.safeParse(invalid).success, false);
    });

    it('computes deterministic SHA-256 answers hash', () => {
      const answers1 = [
        { questionId: 'salary', answer: 100000 },
        { questionId: 'sponsorship', answer: 'No' },
      ];
      const answers2 = [
        { questionId: 'sponsorship', answer: 'No' },
        { questionId: 'salary', answer: 100000 },
      ];

      const hash1 = computeAnswersHash(answers1);
      const hash2 = computeAnswersHash(answers2);

      assert.strictEqual(hash1, hash2, 'Hash must be order-independent for sorted keys');
      assert.ok(hash1.length >= 8);
    });
  });

  // Test Suite 2: MongoDBSaver Checkpointer
  describe('2. Persistent Checkpointer (MongoDBSaver)', () => {
    it('saves, retrieves, and deletes checkpoint tuples', async () => {
      const saver = new MongoDBSaver();
      const threadConfig = {
        configurable: {
          thread_id: 'test_thread_999',
          checkpoint_ns: 'test_ns',
        },
      };

      const mockCheckpoint = {
        id: 'chk_001',
        v: 1,
        ts: new Date().toISOString(),
        channel_values: {
          stepCount: 1,
          status: AGENT_STATUS.FILLING,
        },
      };

      const mockMetadata = {
        source: 'input',
        step: 1,
      };

      // Mock DB persistence for standalone unit testing
      let storedDoc = null;
      const originalFindOneAndUpdate = LangGraphCheckpoint.findOneAndUpdate;
      const originalFindOne = LangGraphCheckpoint.findOne;
      const originalDeleteMany = LangGraphCheckpoint.deleteMany;

      LangGraphCheckpoint.findOneAndUpdate = async (query, update) => {
        storedDoc = {
          threadId: update.threadId,
          checkpointNamespace: update.checkpointNamespace,
          checkpointId: update.checkpointId,
          checkpoint: update.checkpoint,
          metadata: update.metadata,
        };
        return storedDoc;
      };

      LangGraphCheckpoint.findOne = () => ({
        sort: () => ({
          lean: async () => storedDoc,
        }),
      });

      LangGraphCheckpoint.deleteMany = async () => {
        storedDoc = null;
      };

      try {
        // Put checkpoint
        const putConfig = await saver.put(threadConfig, mockCheckpoint, mockMetadata, {});
        assert.strictEqual(putConfig.configurable.checkpoint_id, 'chk_001');

        // Get checkpoint tuple
        const tuple = await saver.getTuple(threadConfig);
        assert.ok(tuple);
        assert.strictEqual(tuple.checkpoint.id, 'chk_001');
        assert.strictEqual(tuple.checkpoint.channel_values.status, AGENT_STATUS.FILLING);

        // Delete thread
        await saver.deleteThread('test_thread_999');
        const emptyTuple = await saver.getTuple(threadConfig);
        assert.strictEqual(emptyTuple, undefined);
      } finally {
        LangGraphCheckpoint.findOneAndUpdate = originalFindOneAndUpdate;
        LangGraphCheckpoint.findOne = originalFindOne;
        LangGraphCheckpoint.deleteMany = originalDeleteMany;
      }
    });
  });

  // Test Suite 3: StateGraph Interrupt and Resume Workflow
  describe('3. LangGraph Interrupt & Resume Cycle', () => {
    it('interrupts at reviewGate and resumes with user approval Command', async () => {
      const memoryCheckpointer = new MemorySaver();
      const testGraph = createBrowserAgentGraph(memoryCheckpointer);

      const threadId = `test_hitl_thread_${Date.now()}`;
      const config = {
        configurable: {
          thread_id: threadId,
        },
      };

      const initialAnswers = [
        { questionId: 'visa_sponsorship', answer: 'No', source: 'profile' },
      ];
      const initialHash = computeAnswersHash(initialAnswers);

      const initialState = {
        applicationId: 'app_test_hitl_1',
        userId: 'user_test_hitl_1',
        threadId,
        currentUrl: 'https://careers.corp.com/review',
        pageType: PERCEPTION_PAGE_TYPES.REVIEW,
        stepCount: 1,
        pendingQuestions: [],
        answers: initialAnswers,
        finalReview: { approved: false, hash: '' },
        status: AGENT_STATUS.WAITING_FOR_CONFIRMATION,
      };

      // 1. Initial invocation halts at reviewGate interrupt
      let result = null;
      try {
        result = await testGraph.invoke(initialState, config);
      } catch (err) {
        // Interrupted
      }

      // Check interrupted state
      const stateBeforeResume = await testGraph.getState(config);
      assert.ok(stateBeforeResume.next && stateBeforeResume.next.length > 0, 'Graph should be paused at interrupt point');

      // 2. Resume with Command({ resume: { approved: true, hash } })
      const resumeResult = await testGraph.invoke(
        new Command({
          resume: { approved: true, hash: initialHash },
        }),
        config
      );

      assert.ok(resumeResult);
      assert.strictEqual(resumeResult.finalReview.approved, true);
      assert.strictEqual(resumeResult.status, AGENT_STATUS.COMPLETED);
      assert.strictEqual(resumeResult.submission.submitted, true);
    });
  });
});
