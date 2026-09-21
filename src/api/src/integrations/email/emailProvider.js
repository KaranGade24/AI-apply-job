import nodemailer from "nodemailer";
import { logError } from "../../utils/logger.js";
import { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } from "../../config/env.js";

let transporterInstance = null;

/**
 * Creates or returns the Nodemailer transporter instance
 * @returns {object} Nodemailer Transporter
 */
export const getEmailTransporter = () => {
  if (transporterInstance) {
    return transporterInstance;
  }

  const host = SMTP_HOST;
  const port = SMTP_PORT;
  const user = SMTP_USER;
  const pass = SMTP_PASS;

  if (user && pass) {
    if (host.includes("gmail") || host === "smtp.gmail.com") {
      transporterInstance = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user,
          pass, // Google App Password (16 characters)
        },
      });
    } else {
      transporterInstance = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
    }
  } else {
    // In development / missing env mode: create JSON / stream fallback transporter that simulates email sending cleanly
    transporterInstance = nodemailer.createTransport({
      jsonTransport: true,
    });
  }

  return transporterInstance;
};

/**
 * Verifies SMTP connection configuration
 * @returns {Promise<boolean>}
 */
export const verifyTransporter = async () => {
  try {
    const transporter = getEmailTransporter();
    if (transporter.options && transporter.options.jsonTransport) {
      return true;
    }
    await transporter.verify();
    return true;
  } catch (error) {
    await logError("emailProvider.verifyTransporter", error.message);
    return false;
  }
};
