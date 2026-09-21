import path from "path";
import fs from "fs/promises";
import { getEmailTransporter } from "./emailProvider.js";
import { logError } from "../../utils/logger.js";
import { appError } from "../../utils/errors.js";
import { EMAIL_FROM } from "../../config/env.js";

/**
 * Sends an application email with optional tailored resume PDF attachment
 * @param {object} params
 * @param {string} params.recipient - Target HR / Recruiter email
 * @param {string} params.subject - Email subject line
 * @param {string} params.body - Email body text or HTML
 * @param {string} [params.pdfPath] - Absolute or relative path to tailored resume PDF
 * @param {string} [params.senderEmail] - Sender email address override
 * @returns {Promise<object>} Send status and messageId
 */
export const sendApplicationEmail = async ({
  recipient,
  subject,
  body,
  pdfPath,
  senderEmail,
}) => {
  try {
    if (!recipient || !subject || !body) {
      throw new appError("Recipient, subject, and body are required to send application email", 400);
    }

    const transporter = getEmailTransporter();
    const fromAddress = senderEmail || EMAIL_FROM;

    const mailOptions = {
      from: `Candidate <${fromAddress}>`,
      to: recipient,
      subject,
      text: body,
      html: body.replace(/\n/g, "<br>"),
      attachments: [],
    };

    if (pdfPath) {
      try {
        const resolvedPath = path.isAbsolute(pdfPath)
          ? pdfPath
          : path.resolve(process.cwd(), pdfPath);

        await fs.access(resolvedPath);
        mailOptions.attachments.push({
          filename: path.basename(resolvedPath),
          path: resolvedPath,
          contentType: "application/pdf",
        });
      } catch (pathErr) {
        await logError("emailService.sendApplicationEmail.attachment", `PDF Attachment access error: ${pathErr.message}`);
      }
    }

    const info = await transporter.sendMail(mailOptions);

    return {
      success: true,
      messageId: info.messageId || `msg-${Date.now()}`,
      response: info.response || "Delivered via transport",
    };
  } catch (error) {
    await logError("emailService.sendApplicationEmail", error.message);
    throw new appError(`Email dispatch failed: ${error.message}`, 500);
  }
};
