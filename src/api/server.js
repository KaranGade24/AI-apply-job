import express from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { connectToDatabase } from './src/config/database.js';
import authRouter from './src/router/authRouter.js';
import resumeRouter from './src/router/resumeRouter.js';
import { swaggerOptions } from './src/config/swagger.js';
import { DEFAULT_PORT } from './src/constant/api.constant.js';

const app = express();

// Middleware to parse JSON and URL-encoded request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root route - redirect to API documentation
app.get('/', (req, res) => {
  res.redirect('/api-docs');
});

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Register Routes
app.use('/api/auth', authRouter);
app.use('/api/resume', resumeRouter);

const PORT = DEFAULT_PORT;

// Start Express server immediately so port 3000 responds right away
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📄 Swagger documentation available at: http://localhost:${PORT}/api-docs`);
  
  // Connect to database asynchronously after server start
  connectToDatabase().catch((err) => {
    console.error('Failed async DB connect:', err.message);
  });
});

