import assert from "node:assert/strict";
import { test } from "node:test";
import { AGENT_STATUS } from "../constant/agent.constant.js";
import { APPLICATION_STATUS } from "../constant/application.constant.js";
import {
  normalizeWorkflowStatus,
  toAgentStatus,
  toApplicationStatus,
} from "../agent/statusMapping.js";

test("workflow status mapping keeps agent, application, and session states aligned", () => {
  assert.equal(
    toApplicationStatus(AGENT_STATUS.WAITING_FOR_USER),
    APPLICATION_STATUS.WAITING_FOR_USER,
  );
  assert.equal(
    toAgentStatus(APPLICATION_STATUS.WAITING_FOR_FINAL_REVIEW),
    AGENT_STATUS.WAITING_FOR_CONFIRMATION,
  );
  assert.deepEqual(
    normalizeWorkflowStatus({ agentStatus: AGENT_STATUS.COMPLETED }),
    {
      agentStatus: AGENT_STATUS.COMPLETED,
      applicationStatus: APPLICATION_STATUS.APPLIED,
      sessionStatus: APPLICATION_STATUS.APPLIED.toLowerCase(),
    },
  );
});
