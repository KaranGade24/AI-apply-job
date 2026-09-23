import jwt from "jsonwebtoken";
import fs from "fs";
import { appError, handleError } from "../utils/errors.js";
import { JWT_SECRET } from "../config/env.js";

/**
 * Strict Authentication Middleware
 * Extracts JWT token from Authorization header, req.body.token, or req.query.token
 * Validates token signature and expiration against JWT_SECRET.
 */
export const authMiddleware = (req, res, next) => {
  try {
    let token = null;

    // 1. Authorization header (Bearer <token>)
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }
    // 2. req.body.token
    else if (req.body && req.body.token) {
      token = req.body.token;
    }
    // 3. req.query.token
    else if (req.query && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      throw new appError(
        "Authentication required. JWT token must be provided in Authorization header or body.",
        401
      );
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (error) {
    // If a file was uploaded by multer prior to auth check, clean it up
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
    if (req.body && req.body.token) {
      token = req.body.token;
    } else if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.query && req.query.token) {
      token = req.query.token;
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
