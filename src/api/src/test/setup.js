process.env.NODE_ENV = 'test';
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test_jwt_secret_key_12345';
if (!process.env.ENCRYPTION_KEY) process.env.ENCRYPTION_KEY = 'test_encryption_key_different_54321';
if (!process.env.MONGO_URI) process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/test_db';
if (!process.env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = 'test_gemini_api_key';
