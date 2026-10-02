import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { getGeminiModel } from "../config/modelConfig.js";
import { deepDiveDecisionSchema } from "../schema/actionSchema.js";
import { formatAnalysisForLlm } from "../browser/analyze/pageAnalyzer.js";
import {
  DEEP_DIVE_ACTIONS,
  HUMAN_INTERVENTION_REASONS,
  PERCEPTION_PAGE_TYPES,
  DISABLED_BUTTON_REASONS,
} from "../../constant/agent.constant.js";
import { logJobEvent, logError } from "../../utils/logger.js";

const DECISION_SYSTEM_PROMPT = `You are the Autonomous Decision Engine of the AI-Apply-Job Browser Agent.
Your role is to understand the current page state, the target job, and candidate background, and determine the exact single NEXT VALID ACTION to advance the application workflow.

You do NOT follow hardcoded website recipes. Instead, you:
1. Observe the current page type, visible elements, form fields, buttons, and validation messages.
2. Determine if the application was already submitted successfully (if so, return 'finish').
3. Detect blockers requiring human intervention (CAPTCHA, 2FA, unknown authentication, legal consent) and return 'humanIntervention'.
4. Reason about disabled buttons: If an "Apply", "Next", or "Submit" button is disabled, identify what missing prerequisite must be completed first (e.g. filling an empty required field, checking a terms agreement checkbox, selecting a dropdown value, or uploading a resume).
5. Decide the highest-priority next action:
   - 'type': fill an empty input (name, email, phone, location, experience, etc.) using candidate profile facts.
   - 'upload': upload the tailored ATS resume PDF to a file input.
   - 'select': choose the matching option in a dropdown (country, state, experience, work authorization).
   - 'check': check a required checkbox (terms, consent, privacy policy, affirmative agreement).
   - 'click': click a button ("Apply Now", "Next", "Continue", or opening role) to proceed.
   - 'submit': click the final submission button once all required fields are filled.
   - 'wait': wait briefly if page is loading or submitting.
   - 'humanIntervention': pause and notify user if human action is mandatory.

Rules:
- Never fabricate candidate credentials not present in candidate profile or resume.
- Prioritize required fields before clicking Next or Submit.
- When an Apply button is disabled, do not give up—find and resolve the missing field or checkbox.
- Always output strict JSON matching the schema.`;

/**
 * Evaluates the current page analysis and decides the next action.
 */
export const decideNextDeepDiveAction = async (params) => {
  const {
    pageAnalysis,
    jobContext = {},
    userProfile = {},
    resumeData = {},
    actionHistory = [],
    userId = null,
  } = params;

  try {
    // 1. Fast Path: Submission Success Check
    if (pageAnalysis.pageType === PERCEPTION_PAGE_TYPES.SUBMISSION_SUCCESS) {
      return {
        analysisSummary: "Application submitted successfully on employer portal.",
        pageState: "submission_success",
        nextAction: {
          type: DEEP_DIVE_ACTIONS.FINISH,
          reason: "Submission confirmation message detected on page.",
          confidence: 1.0,
        },
      };
    }

    // 2. Fast Path: Security Challenge / CAPTCHA Check
    if (pageAnalysis.pageType === PERCEPTION_PAGE_TYPES.CAPTCHA_OR_BLOCKED) {
      return {
        analysisSummary: "Security CAPTCHA challenge detected on page.",
        pageState: "blocked",
        nextAction: {
          type: DEEP_DIVE_ACTIONS.HUMAN_INTERVENTION,
          interventionType: HUMAN_INTERVENTION_REASONS.CAPTCHA,
          reason: "Employer portal requires CAPTCHA verification to proceed.",
          confidence: 1.0,
        },
      };
    }

    // 3. Fast Path: Disabled Button Prerequisite Reasoning
    // If submit/next button is disabled, directly address the missing prerequisite!
    if (pageAnalysis.disabledButtonReasoning?.hasDisabledSubmit) {
      const { reason, suggestedPrerequisiteAction, message } = pageAnalysis.disabledButtonReasoning;

      if (suggestedPrerequisiteAction) {
        if (suggestedPrerequisiteAction.type === "upload") {
          return {
            analysisSummary: `Submit button is disabled because resume is required: ${message}`,
            pageState: "application_form",
            missingPrerequisites: [message],
            nextAction: {
              type: DEEP_DIVE_ACTIONS.UPLOAD,
              target: suggestedPrerequisiteAction.target,
              value: resumeData.pdfPath || "",
              reason: `Upload tailored ATS resume (${resumeData.fileName || "resume.pdf"}) to fulfill required file input.`,
              confidence: 0.95,
            },
          };
        }

        if (suggestedPrerequisiteAction.type === "check") {
          return {
            analysisSummary: `Submit button is disabled because terms/consent is unchecked: ${message}`,
            pageState: "application_form",
            missingPrerequisites: [message],
            nextAction: {
              type: DEEP_DIVE_ACTIONS.CHECK,
              target: suggestedPrerequisiteAction.target,
              reason: `Agree to required employer terms / consent checkbox (${suggestedPrerequisiteAction.field}).`,
              confidence: 0.95,
            },
          };
        }

        if (suggestedPrerequisiteAction.type === "type") {
          // Resolve value from profile
          const fieldName = (suggestedPrerequisiteAction.field || "").toLowerCase();
          let valueToFill = "";

          if (fieldName.includes("phone") || fieldName.includes("mobile")) {
            valueToFill = userProfile.personal?.phone || userProfile.phone || "";
          } else if (fieldName.includes("email")) {
            valueToFill = userProfile.personal?.email || userProfile.email || "";
          } else if (fieldName.includes("name")) {
            valueToFill = userProfile.personal?.fullName || userProfile.fullName || "";
          } else if (fieldName.includes("city") || fieldName.includes("location")) {
            valueToFill = userProfile.personal?.location || userProfile.location || "Pune, India";
          } else if (fieldName.includes("salary") || fieldName.includes("ctc")) {
            valueToFill = "Negotiable";
          } else if (fieldName.includes("experience") || fieldName.includes("years")) {
            valueToFill = userProfile.experience?.[0]?.years || "3";
          }

          if (valueToFill) {
            return {
              analysisSummary: `Submit button is disabled because required field "${suggestedPrerequisiteAction.field}" is empty.`,
              pageState: "application_form",
              missingPrerequisites: [message],
              nextAction: {
                type: DEEP_DIVE_ACTIONS.TYPE,
                target: suggestedPrerequisiteAction.target,
                value: valueToFill,
                reason: `Fill empty required field "${suggestedPrerequisiteAction.field}" with candidate value.`,
                confidence: 0.95,
              },
            };
          }
        }
      }
    }

    // 4. Comprehensive LLM Reasoning via Gemini
    const model = await getGeminiModel(userId);
    const structuredModel = model.withStructuredOutput(deepDiveDecisionSchema);

    const formattedPageText = formatAnalysisForLlm(pageAnalysis);

    // Build Candidate Facts summary
    const candidateSummary = [
      `Name: ${userProfile.personal?.fullName || userProfile.fullName || "Applicant"}`,
      `Email: ${userProfile.personal?.email || userProfile.email || ""}`,
      `Phone: ${userProfile.personal?.phone || userProfile.phone || ""}`,
      `Location: ${userProfile.personal?.location || userProfile.location || ""}`,
      `Skills: ${(userProfile.skills || []).slice(0, 10).join(", ")}`,
      `Resume PDF Path: ${resumeData.pdfPath || ""}`,
      `Resume File Name: ${resumeData.fileName || "Tailored_Resume.pdf"}`,
    ].join("\n");

    // History summary (last 4 actions)
    const recentHistory = actionHistory
      .slice(-4)
      .map((a, i) => `${i + 1}. [${a.type}] target: ${a.target || "N/A"} -> ${a.result || a.reason || "Done"}`)
      .join("\n") || "No prior actions taken.";

    const promptMessage = `--- CURRENT WEBPAGE OBSERVATION ---
${formattedPageText}

--- TARGET JOB CONTEXT ---
Title: ${jobContext.title || "Target Role"}
Company: ${jobContext.company || "Employer"}
Location: ${jobContext.location || "Any"}
Description Snippet: ${(jobContext.description || "").slice(0, 400)}

--- CANDIDATE CREDENTIALS & PROFILE ---
${candidateSummary}

--- RECENT ACTION HISTORY ---
${recentHistory}

Evaluate the page state and determine the single next valid action.`;

    const response = await structuredModel.invoke([
      new SystemMessage({ content: DECISION_SYSTEM_PROMPT }),
      new HumanMessage({ content: promptMessage }),
    ]);

    await logJobEvent(
      "decisionEngine",
      "LLM_DECISION_SUCCESS",
      `Decision: [${response.nextAction?.type}] target: "${response.nextAction?.target || ""}" - ${response.nextAction?.reason} (Confidence: ${response.nextAction?.confidence})`
    );

    return response;
  } catch (error) {
    await logError("decisionEngine.decideNextDeepDiveAction", error.message);

    // Safe fallback rule-based decision
    if (pageAnalysis.buttons && pageAnalysis.buttons.length > 0) {
      const applyBtn = pageAnalysis.buttons.find((b) => !b.disabled && (b.isSubmit || /apply|next|continue/i.test(b.text)));
      if (applyBtn) {
        return {
          analysisSummary: "Fallback rule: Clicking active navigation or apply button.",
          pageState: "active_form",
          nextAction: {
            type: DEEP_DIVE_ACTIONS.CLICK,
            target: applyBtn.selector,
            reason: `Click button "${applyBtn.text}" to advance workflow.`,
            confidence: 0.75,
          },
        };
      }
    }

    return {
      analysisSummary: `Decision engine encountered error: ${error.message}`,
      pageState: "unknown",
      nextAction: {
        type: DEEP_DIVE_ACTIONS.WAIT,
        value: "2000",
        reason: "Wait for page to settle and retry analysis.",
        confidence: 0.5,
      },
    };
  }
};

export default {
  decideNextDeepDiveAction,
};
