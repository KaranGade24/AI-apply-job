import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/env.js";
import applicationRouter from "../router/application.router.js";
import { JobApplication } from "../model/JobApplication.js";
import { globalErrorHandler } from "../utils/errors.js";

describe("Phase E — Application Router Strict Verification Test Suite", () => {
  let app;
  let originalFindById;
  const mockUserId = "user_test_id_12345";
  let validToken;

  before(() => {
    // Overwrite mongoose findById chain for unit testing controller behavior
    originalFindById = JobApplication.findById;

    JobApplication.findById = function (id) {
      return {
        populate: function () {
          return {
            populate: async function () {
              // Simulate other-user's application (leads to 403 Access Denied)
              if (String(id) === "507f1f77bcf86cd799439011") {
                return {
                  _id: id,
                  userId: "another_user_id_xyz",
                  jobId: {
                    _id: "job_id_xyz",
                    title: "Software Developer",
                    company: "Acme Corp",
                  },
                };
              }
              // Simulate owned application (leads to 200/success or custom behavior)
              if (String(id) === "507f1f77bcf86cd799439022") {
                return {
                  _id: id,
                  userId: mockUserId,
                  jobId: {
                    _id: "job_id_xyz",
                    title: "Software Developer",
                    company: "Acme Corp",
                  },
                };
              }
              // Simulate non-existent application (leads to 404 Not Found)
              return null;
            },
          };
        },
      };
    };

    // Prepare express test application
    app = express();
    app.use(express.json());
    app.use("/api/applications", applicationRouter);
    app.use(globalErrorHandler);

    // Sign test JWT
    validToken = jwt.sign(
      { userId: mockUserId, email: "test@user.com" },
      JWT_SECRET,
    );
  });

  after(() => {
    // Restore original mongoose method
    JobApplication.findById = originalFindById;
  });

  it("1. Verifies that every expected route registered in 3370c51 still exists", () => {
    // Traverse express router layers and extract registered route paths and methods
    const registeredRoutes = [];
    applicationRouter.stack.forEach((layer) => {
      if (layer.route) {
        const path = layer.route.path;
        const methods = Object.keys(layer.route.methods);
        methods.forEach((method) => {
          registeredRoutes.push({ path, method: method.toLowerCase() });
        });
      }
    });

    const expectedRoutes = [
      { path: "/:id/agent/start", method: "post" },
      { path: "/:id/agent/status", method: "get" },
      { path: "/:id/agent/questions", method: "get" },
      { path: "/:id/agent/answers", method: "post" },
      { path: "/:id/agent/review", method: "get" },
      { path: "/:id/agent/review", method: "patch" },
      { path: "/:id/agent/confirm", method: "post" },
      { path: "/:id/agent/cancel", method: "post" },
      { path: "/process-next", method: "post" },
      { path: "/", method: "post" },
      { path: "/preview-draft", method: "post" },
      { path: "/job/:jobId", method: "get" },
      { path: "/create-from-job/:jobId", method: "post" },
      { path: "/", method: "get" },
      { path: "/:id", method: "get" },
      { path: "/:id", method: "delete" },
      { path: "/:id/status", method: "patch" },
      { path: "/:id/tailor", method: "post" },
      { path: "/:id/answers", method: "post" },
      { path: "/:id/answers", method: "put" },
      { path: "/:id/refill-form", method: "post" },
      { path: "/:id/confirm", method: "post" },
      { path: "/:id/analyze-portal", method: "post" },
      { path: "/:id/advance-portal", method: "post" },
      { path: "/:id/tailor-role", method: "post" },
      { path: "/:id/send-email-direct", method: "post" },
      { path: "/:id/apply-roles-batch", method: "post" },
      { path: "/:id/retry-google-form", method: "post" },
      { path: "/:id/approve", method: "post" },
      { path: "/:id/reject", method: "post" },
      { path: "/:id/review", method: "put" },
      { path: "/:id/resume", method: "put" },
      { path: "/:id/pdf", method: "get" },
    ];

    expectedRoutes.forEach((expected) => {
      const found = registeredRoutes.some(
        (r) => r.path === expected.path && r.method === expected.method,
      );
      assert.ok(
        found,
        `Expected route ${expected.method.toUpperCase()} ${expected.path} is missing from applicationRouter!`,
      );
    });
  });

  it("2. Returns 401 Unauthorized when requesting without valid Bearer token", async () => {
    const res = await request(app).get(
      "/api/applications/507f1f77bcf86cd799439011",
    );
    assert.strictEqual(res.status, 401);
  });

  it("3. Returns 404 Not Found for non-existent application with valid JWT", async () => {
    const res = await request(app)
      .get("/api/applications/507f1f77bcf86cd7994390aa") // returns null from findById
      .set("Authorization", `Bearer ${validToken}`);
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.success, false);
    assert.ok(
      res.body.message.includes("not found") ||
        res.body.message.includes("Application not found"),
    );
  });

  it("4. Returns 403 Forbidden for unauthorized application ownership with valid JWT", async () => {
    const res = await request(app)
      .get("/api/applications/507f1f77bcf86cd799439011") // returns app owned by 'another_user_id_xyz'
      .set("Authorization", `Bearer ${validToken}`);
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
    assert.ok(
      res.body.message.toLowerCase().includes("unauthorized") ||
        res.body.message.toLowerCase().includes("denied"),
    );
  });

  it("5. Returns 400 for malformed agent answers payloads", async () => {
    const res = await request(app)
      .post("/api/applications/507f1f77bcf86cd799439022/agent/answers")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ answers: [] });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.match(res.body.message, /Invalid answers payload/i);
  });

  it("6. Returns 400 for malformed agent review confirmation payloads", async () => {
    const res = await request(app)
      .post("/api/applications/507f1f77bcf86cd799439022/agent/confirm")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ approved: false });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.match(res.body.message, /Invalid review confirmation payload/i);
  });
});
