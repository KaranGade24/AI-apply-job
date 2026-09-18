export const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Authentication API',
      version: '1.0.0',
      description: 'API Documentation for the Node.js Authentication Service',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development Server',
      },
    ],
  },
  // Path to scan for Swagger JSDoc comments
  apis: ['./src/api/src/router/*.js'], 
};
