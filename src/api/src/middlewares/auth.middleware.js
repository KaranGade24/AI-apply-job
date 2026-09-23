import jwt from "jsonwebtoken";
import fs from "fs";
import { appError, handleError } from "../utils/errors.js";
import { JWT_SECRET } from "../config/env.js";

/**
 * Authentication Middleware
 * Extracts JWT token from req.body.token (or Authorization header / query string for flexibility)
 * Attaches decoded user payload to req.user
 */
export const authMiddleware = (req, res, next) => {
  try {
    let token = null;

    // Primary source: req.body.token as requested
    if (req.body && req.body.token) {
      token = req.body.token;
    }
    // Secondary source: Authorization header (Bearer <token>)
    else if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }
    // Tertiary source: req.query.token
    else if (req.query && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      throw new appError(
        "Authentication failed. JWT token is required in request body (req.body.token) or Authorization header.",
        401,
      );
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = decoded;
    next();
  } catch (error) {
    // If a file was uploaded by multer prior to auth check, clean it up on auth failure
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
        new appError(`Invalid or expired token: ${error.message}`, 401),
        res,
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
