import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";
import path from "path";
import { fileURLToPath } from "url";

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
import { WebSocketServer } from "ws";
import { subscribeClient } from "./src/browser/session/browserStreamService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Request logging middleware using centralized logger with strict body redaction & route exclusions
app.use((req, res, next) => {
  const { originalUrl, method } = req;

  // Only log API and documentation requests to keep console clean
  if (!originalUrl.startsWith("/api") && !originalUrl.startsWith("/api-docs")) {
    return next();
  }

  const start = Date.now();
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

// API Health Check
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "AI Apply Job Backend API",
    docs: "/api-docs",
  });
});

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

// 404 Handler for undefined API endpoints
app.use((req, res, next) => {
  if (req.originalUrl.startsWith("/api")) {
    return next(
      new appError(
        `Cannot find endpoint ${req.originalUrl} on this server!`,
        404,
      ),
    );
  }
  next();
});

// Centralized Global Error Handler for API routes
app.use(globalErrorHandler);

// Mount Frontend: Vite middleware in development, static bundle in production
if (process.env.NODE_ENV !== "production") {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    configFile: path.resolve(__dirname, "../../vite.config.js"),
    server: {
      middlewareMode: true,
      hmr: false,
    },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.resolve(__dirname, "../web/dist");
  app.use(express.static(distPath));
  app.get("/:any*", (req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

// Parse CLI port flag (--port 3000) or explicit APP_PORT / API_PORT / DEFAULT_PORT
const cliArgs = process.argv.slice(2);
let detectedPort = null;
const portArgIndex = cliArgs.indexOf("--port");
if (portArgIndex !== -1 && cliArgs[portArgIndex + 1]) {
  detectedPort = parseInt(cliArgs[portArgIndex + 1], 10);
}

const PORT = detectedPort || process.env.APP_PORT || process.env.API_PORT || DEFAULT_PORT || 3000;

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Full-Stack AI Apply Job Server is running on port ${PORT}`);
  console.log(
    `📚 Swagger documentation available at: http://localhost:${PORT}/api-docs`,
  );

  // Connect to database asynchronously after server start
  connectToDatabase().catch((err) => {
    console.error("Failed async DB connect:", err.message);
  });
});

// Setup WebSocket server for real-time live browser streaming & user interactions
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    let applicationId = url.searchParams.get("applicationId");
    if (!applicationId) {
      const match =
        url.pathname.match(/\/api\/applications\/([^/]+)\/agent\/stream/) ||
        url.pathname.match(/\/api\/applications\/([^/]+)\/browser-stream/) ||
        url.pathname.match(/\/api\/browser-stream\/([^/]+)/);
      if (match) {
        applicationId = match[1];
      }
    }

    if (applicationId) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request, applicationId);
      });
    } else {
      socket.destroy();
    }
  } catch {
    socket.destroy();
  }
});

wss.on("connection", (ws, req, applicationId) => {
  subscribeClient(applicationId, ws);
});

// Setup graceful shutdown hooks for browser sessions
SessionRegistry.setupShutdownHooks(server);

