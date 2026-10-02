import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";

import { connectToDatabase } from "./src/config/database.config.js";
import authRouter from "./src/router/auth.router.js";
import resumeRouter from "./src/router/resume.router.js";
import jobRouter from "./src/router/job.router.js";
import applicationRouter from "./src/router/application.router.js";
import skippedApplicationRouter from "./src/router/skippedApplication.router.js";
import settingRouter from "./src/router/setting.router.js";
import naukriSessionRouter from "./src/router/naukriSession.router.js";
import googleSessionRouter from "./src/router/googleSession.router.js";
import testPlaygroundRouter from "./src/router/testPlayground.router.js";
import { flexibleJsonParser } from "./src/middlewares/customJsonParser.middleware.js";
import { jsonSyntaxErrorHandler } from "./src/middlewares/jsonError.middleware.js";
import { swaggerOptions } from "./src/config/swagger.js";
import { DEFAULT_PORT } from "./src/constant/api.constant.js";
import { appError, globalErrorHandler } from "./src/utils/errors.js";
import { logJobEvent, sanitizeSecrets } from "./src/utils/logger.js";
import { SessionRegistry } from "./src/browser/session/sessionRegistry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Request logging middleware
app.use((req, res, next) => {
  if (
    req.originalUrl.startsWith("/@") ||
    req.originalUrl.startsWith("/src") ||
    req.originalUrl.startsWith("/node_modules") ||
    req.originalUrl.endsWith(".jsx") ||
    req.originalUrl.endsWith(".js") ||
    req.originalUrl.endsWith(".css") ||
    req.originalUrl.endsWith(".ico")
  ) {
    return next();
  }

  const start = Date.now();
  const { method, originalUrl } = req;
  const authHeader = req.headers.authorization ? "Bearer ***" : "None";

  // Never log request bodies for sensitive routes
  const isExcludedRoute =
    originalUrl.includes("/api/google-session") ||
    originalUrl.includes("/api/job-sources") ||
    originalUrl.includes("/api/settings") ||
    originalUrl.includes("/answers") ||
    originalUrl.includes("/api/auth") ||
    originalUrl.includes("/api/resume");

  const logMessage = `API REQ: ${method} ${originalUrl} | Auth: ${authHeader}`;
  logJobEvent("server", "REQUEST", logMessage, "mix");

  if (req.body && Object.keys(req.body).length > 0 && !isExcludedRoute) {
    const sanitizedBodyStr = sanitizeSecrets(JSON.stringify(req.body));
    logJobEvent("server", "REQ_BODY", sanitizedBodyStr, "mix");
  }

  res.on("finish", () => {
    const duration = Date.now() - start;
    const resMsg = `API RES: ${method} ${originalUrl} -> Status ${res.statusCode} (${duration}ms)`;
    logJobEvent("server", "RESPONSE", resMsg, "mix");
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

// Swagger API Documentation setup
const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Register API Routes
app.use("/api/auth", authRouter);
app.use("/api/resume", resumeRouter);
app.use("/api/jobs", jobRouter);
app.use("/api/applications", applicationRouter);
app.use("/api/skipped-applications", skippedApplicationRouter);
app.use("/api/settings", settingRouter);
app.use("/api/job-sources/naukri", naukriSessionRouter);
app.use("/api/google-session", googleSessionRouter);

// Mount test playground ONLY when not in production
if (process.env.NODE_ENV !== "production") {
  app.use("/api/test-pages", testPlaygroundRouter);
}

// Static upload serving
app.use("/uploads", express.static(path.join(__dirname, "../../uploads")));

// Database offline fallback middleware for /api
app.use("/api", (err, req, res, next) => {
  if (
    err.name === "MongooseError" ||
    err.name === "MongoNetworkError" ||
    (err.message && err.message.includes("buffering timed out"))
  ) {
    console.warn("[AI Studio] Database offline — returning mock empty response");
    if (req.method === "GET") {
      return res.json(req.path.endsWith("s") || req.path.endsWith("s/") ? [] : {});
    }
    return res.status(503).json({ error: "Service temporarily unavailable (database offline)" });
  }
  next(err);
});

// 404 Handler for undefined API endpoints
app.use("/api", (req, res, next) => {
  next(
    new appError(
      `Cannot find endpoint ${req.originalUrl} on this server!`,
      404,
    ),
  );
});

// Centralized Global Error Handler
app.use(globalErrorHandler);

// Vite Frontend Middleware / Static files serving
const setupFrontend = async () => {
  if (process.env.NODE_ENV === "production") {
    const distPath = path.resolve(__dirname, "../../src/web/dist");
    app.use(express.static(distPath));
    app.get("*", (req, res, next) => {
      if (req.originalUrl.startsWith("/api") || req.originalUrl.startsWith("/api-docs")) {
        return next();
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: "0.0.0.0", port: 3000 },
      appType: "spa",
      configFile: path.resolve(__dirname, "../../vite.config.js"),
    });
    app.use(vite.middlewares);
  }
};

const PORT = Number(process.env.PORT || process.env.API_PORT || DEFAULT_PORT || 3000);

async function startServer() {
  await setupFrontend();

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Standalone Server is running on port ${PORT}`);
    console.log(`📚 Swagger documentation available at: http://localhost:${PORT}/api-docs`);

    // Connect to database asynchronously after server start
    connectToDatabase().catch((err) => {
      console.warn("Failed async DB connect:", err.message);
    });
  });

  // Setup graceful shutdown hooks for browser sessions
  SessionRegistry.setupShutdownHooks(server);
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
