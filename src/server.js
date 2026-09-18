import express from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { connectToDatabase } from './api/src/config/database.js';
import authRouter from './api/src/router/authRouter.js';
import { swaggerOptions } from './api/src/config/swagger.js';

const app = express();

// Middleware to parse JSON request bodies
app.use(express.json());

// Root route - redirect to API documentation
app.get('/', (req, res) => {
  res.redirect('/api-docs');
});

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Register Routes
app.use('/api/auth', authRouter);

const PORT = 3000;

// Start Express server immediately so port 3000 responds right away
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📄 Swagger documentation available at: http://localhost:${PORT}/api-docs`);
  
  // Connect to database asynchronously after server start
  connectToDatabase().catch((err) => {
    console.error('Failed async DB connect:', err.message);
  });
});

