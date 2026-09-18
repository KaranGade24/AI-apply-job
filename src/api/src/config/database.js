import mongoose from 'mongoose';
import { config } from './env.js';

export const connectToDatabase = async () => {
  try {
    // Set a short timeout so server startup isn't blocked indefinitely if MongoDB is unavailable
    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('✅ Successfully connected to MongoDB');
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    console.warn('⚠️ Server running without active MongoDB connection. Configure MONGO_URI in .env when ready.');
  }
};

