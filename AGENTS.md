# Project Instructions & Clean Architecture Standards

- **Clean Architecture & Modular Separation**:
  - Maintain a strict Clean Architecture pattern and modular folder structure at all times.
  - **Never write monolithic files or bundle multiple dependencies into a single file.**
  - Keep concerns strictly isolated across dedicated folders:
    - `src/api/src/config/`: Database connections, Multer upload setup, Swagger docs, and env variables.
    - `src/api/src/constant/`: Centralized constant definitions (`agent.constant.js`, `api.constant.js`).
    - `src/api/src/controller/`: Request handling and HTTP response generation.
    - `src/api/src/services/`: Core business logic and orchestration.
    - `src/api/src/repositories/`: Database queries and persistence layer (MongoDB/Mongoose).
    - `src/api/src/model/`: Database schemas and Mongoose models (`PascalCase`).
    - `src/api/src/router/`: API route definitions and middleware bindings.
    - `src/api/src/middlewares/`: Authentication, authorization, and request parsing middlewares.
    - `src/api/src/utils/`: Shared utilities (`logger.js`, `errors.js`).
    - `src/api/src/agent/`: AI Agent logic with central orchestrator `agent.js` (equivalent to `server.js` for agents), model configuration in `config/modelConfig.js`, and submodules `graph/`, `prompt/`, `schema/`, and `tools/`.


- **Naming Conventions**:
  - All naming conventions across the project must be in `camelCase`.
  - **Exception**: Model files should use `PascalCase` (e.g., `User`, `UserProfile`, `Resume`).

- **Language Requirements**:
  - Write all backend code in JavaScript (`.js` or `.jsx`). Do NOT use TypeScript.

- **Centralized Constants**:
  - All agent-related constants (e.g., `MODEL_NAME`, `MAX_ATTEMPTS`, `LLM_TIMEOUT_MS`, `AGENT_STATUS`, `ERROR_CODES`) must be declared in `src/api/src/constant/agent.constant.js`.
  - All general API constants (e.g., `DEFAULT_PORT`, `JWT_EXPIRES_IN`, `BCRYPT_SALT_ROUNDS`, `MAX_FILE_SIZE_BYTES`, `ALLOWED_MIME_TYPES`, `TEMP_UPLOAD_DIR_NAME`) must be declared in `src/api/src/constant/api.constant.js`.
  - Always import and reuse constants from these dedicated files across controllers, services, repositories, graph nodes, and middlewares.

- **Logger Requirements**:
  - Always use the centralized logger (`logError`, `logResumeEvent`, `logAuthEvent`, etc. from `src/api/src/utils/logger.js`) for logging errors and system events. Do NOT use `console.error`.

- **Error Handling**:
  - Always use `appError` from `src/api/src/utils/errors.js` for throwing operational application errors.

- **Multer & Upload Configurations**:
  - All Multer file upload configurations must be isolated in `src/api/src/config/multer.config.js` to maintain a clean folder structure and keep controllers/routers modular. Never inline Multer setup inside controllers.
