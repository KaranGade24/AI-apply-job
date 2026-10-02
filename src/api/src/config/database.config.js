import mongoose from 'mongoose';
import { config } from './env.js';
import { logError } from '../utils/logger.js';

export const connectToDatabase = async () => {
  try {
    // Fail fast on queries if MongoDB is disconnected so requests do not hang
    mongoose.set('bufferCommands', false);
    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 3000,
    });
    console.log('✅ Successfully connected to MongoDB');
  } catch (error) {
    await logError('database.config.connectToDatabase', error.message);
    console.warn('⚠️ Server running without active MongoDB connection. Configure MONGO_URI in .env when ready.');
  }
};

export const disconnectFromDatabase = async () => {
  try {
    await mongoose.disconnect();
  } catch (error) {
    await logError('database.config.disconnectFromDatabase', error.message);
  }
};

export default connectToDatabase;
