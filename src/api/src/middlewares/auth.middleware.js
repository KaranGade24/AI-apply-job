import jwt from "jsonwebtoken";
import fs from "fs";
import { appError, handleError } from "../utils/errors.js";
import { JWT_SECRET } from "../config/env.js";

/**
 * Strict Authentication Middleware
 * Extracts JWT token strictly from Authorization header (Bearer <token>).
 * Validates token signature and expiration against JWT_SECRET.
 */
export const authMiddleware = (req, res, next) => {
  try {
    let token = null;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      throw new appError(
        "Authentication required. JWT token must be provided in the Authorization header (Bearer <token>).",
        401
      );
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (error) {
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupErr) {
        // silent catch
      }
    }

    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError"
    ) {
      return handleError(
        new appError(`Invalid or expired authentication token: ${error.message}`, 401),
        res
      );
    }

    return handleError(error, res);
  }
};

export const optionalAuthMiddleware = (req, res, next) => {
  try {
    let token = null;
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    }
  } catch (error) {
    // ignore token errors for optional auth
  }
  next();
};

export default authMiddleware;
