const mongoose = require('mongoose');
const { sanitizeSecrets } = require('./env');

const connectDB = async () => {
  const isProduction = process.env.NODE_ENV === 'production';
  let uri = process.env.MONGODB_URI || process.env.MONGO_URI;

  try {
    if (isProduction) {
      if (!uri || !uri.trim()) {
        throw new Error('Production configuration error: MONGODB_URI (or MONGO_URI) is required.');
      }

      // In production, NEVER use MongoMemoryServer or silently fall back to an unintended database
      const conn = await mongoose.connect(uri);
      console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
      // Do NOT autoSeed demo data in production
      return conn;
    }

    // Auto-use in-memory MongoDB if URI is local or not a real Atlas URI (development / test only)
    const useInMemory = !uri || uri.includes('127.0.0.1') || uri.includes('localhost');

    if (useInMemory) {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongod = await MongoMemoryServer.create();
      uri = mongod.getUri();
      console.log('⚡ Using MongoDB in-memory server (no Atlas needed)');

      // Track in-memory URI for test/dev utilities
      process.env._MONGO_IN_MEMORY_URI = uri;
    }

    try {
      const conn = await mongoose.connect(uri);
      console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
      // Auto-seed if database is fresh (dev only, never during test execution)
      if (process.env.NODE_ENV !== 'test') {
        setTimeout(() => {
          require('../utils/autoSeed').seed().catch(() => {});
        }, 500);
      }
      return conn;
    } catch (atlasErr) {
      if (!useInMemory) {
        console.warn(`⚠️ Could not connect to remote MongoDB Atlas (${sanitizeSecrets(atlasErr.message)}).`);
        console.log('⚡ Falling back to MongoDB in-memory server...');
        const { MongoMemoryServer } = require('mongodb-memory-server');
        const mongod = await MongoMemoryServer.create();
        uri = mongod.getUri();
        process.env._MONGO_IN_MEMORY_URI = uri;
        const conn = await mongoose.connect(uri);
        console.log(`✅ In-Memory MongoDB Connected: ${conn.connection.host}`);
        if (process.env.NODE_ENV !== 'test') {
          setTimeout(() => {
            require('../utils/autoSeed').seed().catch(() => {});
          }, 500);
        }
        return conn;
      } else {
        throw atlasErr;
      }
    }
  } catch (error) {
    const safeError = sanitizeSecrets(error.message);
    console.error(`❌ MongoDB Connection Error: ${safeError}`);
    if (isProduction) {
      process.exit(1);
    } else {
      throw error;
    }
  }
};

module.exports = connectDB;
