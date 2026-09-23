import express from 'express';
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
import { flexibleJsonParser } from './src/middlewares/customJsonParser.middleware.js';
import { jsonSyntaxErrorHandler } from './src/middlewares/jsonError.middleware.js';
import { swaggerOptions } from './src/config/swagger.js';
import { DEFAULT_PORT } from './src/constant/api.constant.js';
import { appError, globalErrorHandler } from './src/utils/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Flexible JSON body parser supporting auto-correction for trailing commas
app.use(flexibleJsonParser);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(jsonSyntaxErrorHandler);

// Serve static uploaded resumes & generated PDF files
const uploadsPath = path.resolve(process.cwd(), 'uploads');
const uploadsRelPath = path.join(__dirname, '../../uploads');

app.use('/uploads', express.static(uploadsPath));
app.use('/uploads', express.static(uploadsRelPath));

// Root route - redirect to API documentation
app.get('/', (req, res) => {
  res.redirect('/api-docs');
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

// 404 Handler for undefined API endpoints
app.use((req, res, next) => {
  next(new appError(`Cannot find endpoint ${req.originalUrl} on this server!`, 404));
});

// Centralized Global Error Handler
app.use(globalErrorHandler);

const PORT = DEFAULT_PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📚 Swagger documentation available at: http://localhost:${PORT}/api-docs`);
  
  // Connect to database asynchronously after server start
  connectToDatabase().catch((err) => {
    console.error('Failed async DB connect:', err.message);
  });
});
