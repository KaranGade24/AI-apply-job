import { pathToFileURL } from 'url';
import { connectToDatabase, disconnectFromDatabase } from '../config/database.config.js';
import { JobApplication } from '../model/JobApplication.js';
import { BrowserSessionRepository } from '../repositories/browserSession.repository.js';
import { logError, logJobEvent } from '../utils/logger.js';

/**
 * Migration script to encrypt legacy plaintext savedStorageState documents in MongoDB.
 * Uses central logger, skips already-encrypted documents, and avoids process.exit in library code.
 *
 * @returns {Promise<{ inspected: number, migrated: number }>}
 */
export async function migrateSessionEncryption() {
  await logJobEvent('migration', 'SESSION_ENCRYPTION_START', 'Starting session storage state encryption migration');
  let inspected = 0;
  let migrated = 0;

  try {
    const apps = await JobApplication.find({
      'workflow.agentState.pendingHumanAction.savedStorageState': { $exists: true, $ne: null },
    });

    inspected = apps.length;
    await logJobEvent('migration', 'SESSION_ENCRYPTION_INSPECT', `Found ${inspected} applications to inspect for storageState encryption`);

    for (const app of apps) {
      const pending = app.workflow?.agentState?.pendingHumanAction;
      const raw = pending?.savedStorageState;

      // Skip already encrypted docs
      if (!raw || (typeof raw === 'object' && raw.cipherText && raw.iv && raw.authTag)) {
        continue;
      }

      // Encrypt and persist
      const encrypted = BrowserSessionRepository.encryptStorageState(raw);
      app.workflow.agentState.pendingHumanAction.savedStorageState = encrypted;
      await app.save();
      migrated++;
      await logJobEvent('migration', 'SESSION_MIGRATED', `Migrated encryption for application ID: ${app._id}`);
    }

    await logJobEvent('migration', 'SESSION_ENCRYPTION_COMPLETE', `Successfully completed migration. Migrated ${migrated} of ${inspected} records.`);
    return { inspected, migrated };
  } catch (error) {
    await logError('migrateSessionEncryption', error.message);
    throw error;
  }
}

// Only execute directly when invoked via CLI (node migrateSessionEncryption.js)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  (async () => {
    try {
      await connectToDatabase();
      await migrateSessionEncryption();
    } catch (err) {
      await logError('migrateSessionEncryption.cli', err.message);
    } finally {
      await disconnectFromDatabase();
    }
  })();
}

export default migrateSessionEncryption;
