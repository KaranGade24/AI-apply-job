import { BaseCheckpointSaver } from '@langchain/langgraph';
import { LangGraphCheckpoint } from '../../model/LangGraphCheckpoint.js';
import { logError } from '../../utils/logger.js';

/**
 * MongoDB-backed persistent CheckpointSaver for LangGraph JS.
 * Extends BaseCheckpointSaver to store thread checkpoints, pending writes, and metadata directly in MongoDB.
 */
export class MongoDBSaver extends BaseCheckpointSaver {
  constructor(serde) {
    super(serde);
  }

  /**
   * Retrieves a checkpoint tuple from MongoDB matching the config.
   *
   * @param {object} config
   * @returns {Promise<object|undefined>} CheckpointTuple or undefined
   */
  async getTuple(config) {
    const threadId = config.configurable?.thread_id;
    const checkpointNamespace = config.configurable?.checkpoint_ns || '';
    const checkpointId = config.configurable?.checkpoint_id;

    if (!threadId) return undefined;

    try {
      const query = { threadId, checkpointNamespace };
      if (checkpointId) {
        query.checkpointId = checkpointId;
      }

      // Fetch the latest matching checkpoint
      const doc = await LangGraphCheckpoint.findOne(query)
        .sort({ createdAt: -1 })
        .lean();

      if (!doc) return undefined;

      const checkpoint = doc.checkpoint;
      const metadata = doc.metadata || {};
      const parentConfig = doc.parentCheckpointId
        ? {
            configurable: {
              thread_id: threadId,
              checkpoint_ns: checkpointNamespace,
              checkpoint_id: doc.parentCheckpointId,
            },
          }
        : undefined;

      const pendingWrites = (doc.pendingWrites || []).map((w) => [
        w.taskId,
        w.channel,
        w.value,
      ]);

      return {
        config: {
          configurable: {
            thread_id: threadId,
            checkpoint_ns: checkpointNamespace,
            checkpoint_id: doc.checkpointId,
          },
        },
        checkpoint,
        metadata,
        parentConfig,
        pendingWrites,
      };
    } catch (error) {
      await logError('MongoDBSaver.getTuple', error.message);
      return undefined;
    }
  }

  /**
   * Lists checkpoint tuples matching the config and options.
   *
   * @param {object} config
   * @param {object} [options]
   * @returns {AsyncGenerator<object>}
   */
  async *list(config, options = {}) {
    const threadId = config.configurable?.thread_id;
    const checkpointNamespace = config.configurable?.checkpoint_ns || '';

    if (!threadId) return;

    try {
      const query = { threadId };
      if (checkpointNamespace) {
        query.checkpointNamespace = checkpointNamespace;
      }
      if (options.before?.configurable?.checkpoint_id) {
        query.checkpointId = { $lt: options.before.configurable.checkpoint_id };
      }

      const limit = options.limit || 50;
      const docs = await LangGraphCheckpoint.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      for (const doc of docs) {
        yield {
          config: {
            configurable: {
              thread_id: threadId,
              checkpoint_ns: checkpointNamespace,
              checkpoint_id: doc.checkpointId,
            },
          },
          checkpoint: doc.checkpoint,
          metadata: doc.metadata || {},
          parentConfig: doc.parentCheckpointId
            ? {
                configurable: {
                  thread_id: threadId,
                  checkpoint_ns: checkpointNamespace,
                  checkpoint_id: doc.parentCheckpointId,
                },
              }
            : undefined,
          pendingWrites: (doc.pendingWrites || []).map((w) => [w.taskId, w.channel, w.value]),
        };
      }
    } catch (error) {
      await logError('MongoDBSaver.list', error.message);
    }
  }

  /**
   * Saves a checkpoint to MongoDB.
   *
   * @param {object} config
   * @param {object} checkpoint
   * @param {object} metadata
   * @param {object} newVersions
   * @returns {Promise<object>} Updated config
   */
  async put(config, checkpoint, metadata, newVersions) {
    const threadId = config.configurable?.thread_id;
    const checkpointNamespace = config.configurable?.checkpoint_ns || '';
    const parentCheckpointId = config.configurable?.checkpoint_id || null;
    const checkpointId = checkpoint.id;

    if (!threadId || !checkpointId) {
      return config;
    }

    try {
      await LangGraphCheckpoint.findOneAndUpdate(
        { threadId, checkpointNamespace, checkpointId },
        {
          threadId,
          checkpointNamespace,
          checkpointId,
          parentCheckpointId,
          checkpoint,
          metadata,
          updatedAt: new Date(),
        },
        { upsert: true, new: true }
      );

      return {
        configurable: {
          thread_id: threadId,
          checkpoint_ns: checkpointNamespace,
          checkpoint_id: checkpointId,
        },
      };
    } catch (error) {
      await logError('MongoDBSaver.put', error.message);
      return config;
    }
  }

  /**
   * Saves intermediate pending writes for a task.
   *
   * @param {object} config
   * @param {Array} writes
   * @param {string} taskId
   * @returns {Promise<void>}
   */
  async putWrites(config, writes, taskId) {
    const threadId = config.configurable?.thread_id;
    const checkpointNamespace = config.configurable?.checkpoint_ns || '';
    const checkpointId = config.configurable?.checkpoint_id;

    if (!threadId || !checkpointId) return;

    try {
      const formattedWrites = writes.map(([channel, value]) => ({
        taskId,
        channel,
        value,
      }));

      await LangGraphCheckpoint.findOneAndUpdate(
        { threadId, checkpointNamespace, checkpointId },
        {
          $push: { pendingWrites: { $each: formattedWrites } },
        }
      );
    } catch (error) {
      await logError('MongoDBSaver.putWrites', error.message);
    }
  }

  /**
   * Deletes all checkpoint history for a thread.
   *
   * @param {string} threadId
   * @returns {Promise<void>}
   */
  async deleteThread(threadId) {
    try {
      await LangGraphCheckpoint.deleteMany({ threadId });
    } catch (error) {
      await logError('MongoDBSaver.deleteThread', error.message);
    }
  }
}

export default MongoDBSaver;
