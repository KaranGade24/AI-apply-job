import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { APPLICATION_METHOD } from "../../../constant/application.constant.js";

const applicationMethodSchema = z.enum([
  APPLICATION_METHOD.EMAIL,
  APPLICATION_METHOD.PHONE,
  APPLICATION_METHOD.GOOGLE_FORM,
  APPLICATION_METHOD.WEBSITE_FORM,
  APPLICATION_METHOD.UNKNOWN,
]);

export const getApplicationMethodTool = tool(
  async ({ rawMethodText, jobDescription }) => {
    const text = `${rawMethodText || ""} ${jobDescription || ""}`.toLowerCase();

    let method = APPLICATION_METHOD.EMAIL; // default for current version

    if (/\b(?:phone|call|whatsapp|contact number)\b/i.test(text)) {
      method = APPLICATION_METHOD.PHONE;
    } else if (/google\.com\/forms|forms\.gle/i.test(text)) {
      method = APPLICATION_METHOD.GOOGLE_FORM;
    } else if (/\b(?:apply on company website|portal|lever\.co|greenhouse\.io|workday)\b/i.test(text)) {
      method = APPLICATION_METHOD.WEBSITE_FORM;
    } else if (/\b(?:email|mailto|send resume to|hr@|careers@)\b/i.test(text) || !rawMethodText) {
      method = APPLICATION_METHOD.EMAIL;
    } else {
      method = APPLICATION_METHOD.UNKNOWN;
    }

    return JSON.stringify({
      applicationMethod: method,
      isSupported: method === APPLICATION_METHOD.EMAIL,
    });
  },
  {
    name: "getApplicationMethodTool",
    description: "Classifies job application method into controlled vocabulary ('email', 'phone', 'googleForm', 'websiteForm', 'unknown')",
    schema: z.object({
      rawMethodText: z.string().optional().describe("Raw application method string from job posting"),
      jobDescription: z.string().optional().describe("Full job description text"),
    }),
  }
);
