import { connectToDatabase, disconnectFromDatabase } from '../config/database.config.js';
import { JobApplication } from '../model/JobApplication.js';
import { encryptValue } from '../utils/encryption.js';
import { logError } from '../utils/logger.js';

async function migrateSessionEncryption() {
  console.log('--- STARTING SESSION STORAGE STATE ENCRYPTION MIGRATION ---');
  try {
    await connectToDatabase();

    const apps = await JobApplication.find({
      'workflow.agentState.pendingHumanAction.savedStorageState': { $exists: true, $ne: null }
    });

    console.log(`Found ${apps.length} applications with saved storage state to inspect.`);

    let migratedCount = 0;
    for (const app of apps) {
      const pending = app.workflow?.agentState?.pendingHumanAction;
      if (pending && pending.savedStorageState && !pending.savedStorageState.cipherText) {
        const plainTextState = typeof pending.savedStorageState === 'string'
          ? pending.savedStorageState
          : JSON.stringify(pending.savedStorageState);

        const encrypted = encryptValue(plainTextState);
        app.workflow.agentState.pendingHumanAction.savedStorageState = encrypted;
        await app.save();
        migratedCount++;
        console.log(`Migrated encryption for application ID: ${app._id}`);
      }
    }

    console.log(`Successfully migrated ${migratedCount} application session states.`);
  } catch (error) {
    console.error('Migration failed:', error);
    await logError('migrateSessionEncryption', error.message);
  } finally {
    await disconnectFromDatabase();
    console.log('--- MIGRATION COMPLETED ---');
    process.exit(0);
  }
}

migrateSessionEncryption();
