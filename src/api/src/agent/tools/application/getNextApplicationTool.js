import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { findNextPendingApplication } from "../../../repositories/application.repository.js";
import { logError } from "../../../utils/logger.js";

export const getNextApplicationTool = tool(
  async ({ userId }) => {
    try {
      const application = await findNextPendingApplication(userId);
      if (!application) {
        return JSON.stringify({
          found: false,
          message: "No pending applications found for user",
        });
      }
      return JSON.stringify({
        found: true,
        applicationId: application._id.toString(),
        jobId: application.jobId._id.toString(),
        jobTitle: application.jobId.title,
        companyName: application.jobId.companyName,
        applicationMethod: application.applicationMethod || "email",
        status: application.status,
      });
    } catch (error) {
      await logError("getNextApplicationTool", error.message);
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: "getNextApplicationTool",
    description: "Fetches the next pending job application for a specific user from the database",
    schema: z.object({
      userId: z.string().describe("MongoDB User ID"),
    }),
  }
);
