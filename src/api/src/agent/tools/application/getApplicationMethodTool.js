import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { APPLICATION_METHOD } from "../../../constant/application.constant.js";
import { isGoogleFormUrl } from "../../../application/googleForm/googleFormFiller.js";

/**
 * Classifies the job application method into one of 4 canonical categories:
 *
 * 1. email       — Apply via email (hr@company.com, send resume to, careers@)
 * 2. phone       — Apply via phone (call, whatsapp, contact number)
 * 3. googleForm  — Direct Google Form link (forms.gle, docs.google.com/forms)
 * 4. unknown     — Career page / portal / any other URL (AI will analyze and decide)
 *
 * Method detection priority:
 * 1. Google Form URL pattern detection (highest confidence)
 * 2. Email keyword/pattern detection
 * 3. Phone keyword detection
 * 4. Career site / portal URL detection → "unknown" (AI browser analysis)
 */
export const getApplicationMethodTool = tool(
  async ({ rawMethodText, jobDescription, applicationUrl }) => {
    const text = `${rawMethodText || ""} ${jobDescription || ""}`.toLowerCase();

    let method = APPLICATION_METHOD.UNKNOWN; // Default: AI will analyze

    // Priority 1: Direct Google Form URL
    if (applicationUrl && isGoogleFormUrl(applicationUrl)) {
      method = APPLICATION_METHOD.GOOGLE_FORM;
    }
    // Priority 2: Email method detection
    else if (
      /\b(?:email|mailto|send resume to|hr@|careers@|apply via email|email your resume)\b/i.test(text) ||
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text)
    ) {
      method = APPLICATION_METHOD.EMAIL;
    }
    // Priority 3: Phone method detection
    else if (
      /\b(?:phone|call us|whatsapp|contact number|ring us|speak to|dial|call to apply)\b/i.test(text)
    ) {
      method = APPLICATION_METHOD.PHONE;
    }
    // Priority 4: Google Form text mention (not URL)
    else if (/google\.com\/forms|forms\.gle|google form/i.test(text)) {
      method = APPLICATION_METHOD.GOOGLE_FORM;
    }
    // Priority 5: Career portal / website (AI will open and analyze)
    else if (
      applicationUrl ||
      /\b(?:apply on company website|apply online|careers page|portal|lever\.co|greenhouse\.io|workday|bamboohr|breezy|ashby|smartrecruiters|successfactors|taleo)\b/i.test(text)
    ) {
      method = APPLICATION_METHOD.UNKNOWN;
    }

    return JSON.stringify({
      applicationMethod: method,
      isEmailMethod: method === APPLICATION_METHOD.EMAIL,
      isPhoneMethod: method === APPLICATION_METHOD.PHONE,
      isGoogleFormMethod: method === APPLICATION_METHOD.GOOGLE_FORM,
      isUnknownMethod: method === APPLICATION_METHOD.UNKNOWN,
      requiresBrowserAutomation:
        method === APPLICATION_METHOD.GOOGLE_FORM ||
        method === APPLICATION_METHOD.UNKNOWN,
      requiresResumeUpload:
        method === APPLICATION_METHOD.GOOGLE_FORM ||
        method === APPLICATION_METHOD.UNKNOWN,
    });
  },
  {
    name: "getApplicationMethodTool",
    description:
      "Classifies job application method into one of 4 canonical methods: 'email' (send resume to HR), 'phone' (call/WhatsApp to apply), 'googleForm' (direct Google Form URL), or 'unknown' (career page/portal — AI will open and analyze the page)",
    schema: z.object({
      rawMethodText: z
        .string()
        .optional()
        .describe("Raw application method string from job posting"),
      jobDescription: z
        .string()
        .optional()
        .describe("Full job description text for context"),
      applicationUrl: z
        .string()
        .optional()
        .describe("Application URL to check for Google Form or career portal patterns"),
    }),
  }
);
