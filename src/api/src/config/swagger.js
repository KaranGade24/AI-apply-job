import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure all glob paths use forward slashes for cross-platform swagger-jsdoc compatibility
const routerGlobPattern = path.join(__dirname, '../router/*.js').replace(/\\/g, '/');
const rootRouterGlobPattern = path.resolve(process.cwd(), 'src/api/src/router/*.js').replace(/\\/g, '/');

export const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AI Job Apply API Documentation',
      version: '1.0.0',
      description: 'Complete Interactive API Documentation for AI-Integrated Job Application System',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Local Development Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: [
    './src/api/src/router/*.js'
  ],
};
