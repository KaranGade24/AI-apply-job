import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';
import { fileURLToPath } from 'url';

import { connectToDatabase } from './src/config/database.config.js';
import authRouter from './src/router/auth.router.js';
import resumeRouter from './src/router/resume.router.js';
import jobRouter from './src/router/job.router.js';
import applicationRouter from './src/router/application.router.js';
import skippedApplicationRouter from './src/router/skippedApplication.router.js';
import settingRouter from './src/router/setting.router.js';
import naukriSessionRouter from './src/router/naukriSession.router.js';
import googleSessionRouter from './src/router/googleSession.router.js';
import testPlaygroundRouter from './src/router/testPlayground.router.js';
import { flexibleJsonParser } from './src/middlewares/customJsonParser.middleware.js';
import { jsonSyntaxErrorHandler } from './src/middlewares/jsonError.middleware.js';
import { swaggerOptions } from './src/config/swagger.js';
import { DEFAULT_PORT } from './src/constant/api.constant.js';
import { appError, globalErrorHandler } from './src/utils/errors.js';
import { logJobEvent } from './src/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Request logging middleware using centralized logger with strict body redaction & route exclusions
app.use((req, res, next) => {
  const start = Date.now();
  const { method, originalUrl } = req;
  const authHeader = req.headers.authorization ? 'Bearer ***' : 'None';
  
  // Never log request bodies for auth, answers or resume routes
  const isExcludedRoute = originalUrl.includes('/api/auth') || 
                          originalUrl.includes('/answers') || 
                          originalUrl.includes('/api/resume');

  const logMessage = `API REQ: ${method} ${originalUrl} | Auth: ${authHeader}`;
  logJobEvent('server', 'REQUEST', logMessage, 'mix');

  if (req.body && Object.keys(req.body).length > 0 && !isExcludedRoute) {
    const safeBody = { ...req.body };
    if (safeBody.password) safeBody.password = '***';
    if (safeBody.token) safeBody.token = '***';
    logJobEvent('server', 'REQ_BODY', JSON.stringify(safeBody), 'mix');
  }

  res.on('finish', () => {
    const duration = Date.now() - start;
    const resMsg = `API RES: ${method} ${originalUrl} -> Status ${res.statusCode} (${duration}ms)`;
    logJobEvent('server', 'RESPONSE', resMsg, 'mix');
  });

  next();
});

// Enable CORS for frontend client calls
app.use(cors({ origin: true, credentials: true }));

// Flexible JSON body parser supporting auto-correction for trailing commas
app.use(flexibleJsonParser);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(jsonSyntaxErrorHandler);

// Root API Health Check
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'AI Apply Job Backend API', docs: '/api-docs' });
});

// Swagger API Documentation setup
const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Register API Routes
app.use('/api/auth', authRouter);
app.use('/api/resume', resumeRouter);
app.use('/api/jobs', jobRouter);
app.use('/api/applications', applicationRouter);
app.use('/api/skipped-applications', skippedApplicationRouter);
app.use('/api/settings', settingRouter);
app.use('/api/job-sources/naukri', naukriSessionRouter);
app.use('/api/google-session', googleSessionRouter);

// Mount test playground ONLY when not in production
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/test-pages', testPlaygroundRouter);
}

// 404 Handler for undefined API endpoints
app.use((req, res, next) => {
  next(new appError(`Cannot find endpoint ${req.originalUrl} on this server!`, 404));
});

// Centralized Global Error Handler
app.use(globalErrorHandler);

const PORT = process.env.API_PORT || DEFAULT_PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Standalone Backend API Server is running on port ${PORT}`);
  console.log(`📚 Swagger documentation available at: http://localhost:${PORT}/api-docs`);
  
  // Connect to database asynchronously after server start
  connectToDatabase().catch((err) => {
    console.error('Failed async DB connect:', err.message);
  });
});
