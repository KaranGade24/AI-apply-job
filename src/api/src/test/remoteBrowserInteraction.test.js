import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { SessionRegistry } from "../browser/session/sessionRegistry.js";
import {
  dispatchBrowserAction,
  getLatestBrowserFrame,
  checkHumanChallengeResolved,
  releaseHeldInputs,
  cleanupStreamState,
  broadcastToApp,
} from "../browser/session/browserStreamService.js";
import {
  takeControlService,
  returnControlService,
  resumeAfterVerificationService,
  dispatchUserActionService,
} from "../services/browserControl.service.js";
import { CONTROL_MODES, AGENT_STATUS } from "../constant/agent.constant.js";

describe("Remote Streamed Browser Interaction & Control", () => {
  const testAppId = "test_app_interactive_12345";
  const testUserId = "test_user_owner_999";
  let session;
  let page;

  before(async () => {
    // Initialize or get session
    session = await SessionRegistry.createOrGetSession(testAppId, testUserId);
    page = session.getActivePage();
    if (page && typeof page.goto === "function") {
      await page.goto("https://www.naukri.com").catch(() => {});
    }
  });

  after(async () => {
    await SessionRegistry.closeSession(testAppId).catch(() => {});
    await cleanupStreamState(testAppId).catch(() => {});
  });

  test("1. Rejects direct user input while in AI mode", async () => {
    session.controlMode = CONTROL_MODES.AI;
    session.humanReason = null;

    const res = await dispatchBrowserAction(testAppId, {
      type: "click",
      x: 100,
      y: 100,
      button: "left",
    });

    assert.equal(res.success, false);
    assert.match(res.message, /AI Autonomous mode/);
  });

  test("2. Switches to HUMAN mode via takeControlService", async () => {
    const res = await takeControlService(testAppId, testUserId);
    assert.equal(res.success, true);
    assert.equal(res.controlMode, CONTROL_MODES.HUMAN);
    assert.equal(session.controlMode, CONTROL_MODES.HUMAN);
  });

  test("3. Forwards mouse move and hover coordinates", async () => {
    const res = await dispatchBrowserAction(testAppId, {
      type: "mouseMove",
      x: 450,
      y: 320,
    });
    assert.equal(res.success, true);
  });

  test("4. Forwards left, right, and middle clicks", async () => {
    const leftRes = await dispatchBrowserAction(testAppId, {
      type: "click",
      x: 200,
      y: 250,
      button: "left",
    });
    assert.equal(leftRes.success, true);

    const rightRes = await dispatchBrowserAction(testAppId, {
      type: "click",
      x: 200,
      y: 250,
      button: "right",
    });
    assert.equal(rightRes.success, true);

    const middleRes = await dispatchBrowserAction(testAppId, {
      type: "click",
      x: 200,
      y: 250,
      button: "middle",
    });
    assert.equal(middleRes.success, true);
  });

  test("5. Forwards mouse drag via mouseDown -> mouseMove -> mouseUp", async () => {
    const downRes = await dispatchBrowserAction(testAppId, {
      type: "mouseDown",
      x: 300,
      y: 300,
      button: "left",
    });
    assert.equal(downRes.success, true);

    const moveRes = await dispatchBrowserAction(testAppId, {
      type: "mouseMove",
      x: 450,
      y: 350,
    });
    assert.equal(moveRes.success, true);

    const upRes = await dispatchBrowserAction(testAppId, {
      type: "mouseUp",
      x: 450,
      y: 350,
      button: "left",
    });
    assert.equal(upRes.success, true);
  });

  test("6. Forwards wheel scrolling without errors", async () => {
    const scrollRes = await dispatchBrowserAction(testAppId, {
      type: "wheel",
      x: 500,
      y: 400,
      deltaX: 0,
      deltaY: 150,
    });
    assert.equal(scrollRes.success, true);
  });

  test("7. Forwards typing into a website field", async () => {
    const typeRes = await dispatchBrowserAction(testAppId, {
      type: "type",
      text: "John Doe",
    });
    assert.equal(typeRes.success, true);

    const insertRes = await dispatchBrowserAction(testAppId, {
      type: "insertText",
      text: "Developer",
    });
    assert.equal(insertRes.success, true);
  });

  test("8. Forwards Backspace, Delete, Enter, Tab key events", async () => {
    const keys = ["Backspace", "Delete", "Enter", "Tab"];
    for (const key of keys) {
      const down = await dispatchBrowserAction(testAppId, { type: "keyDown", key });
      assert.equal(down.success, true);
      const up = await dispatchBrowserAction(testAppId, { type: "keyUp", key });
      assert.equal(up.success, true);
    }
  });

  test("9. Forwards modifier keys (Shift, Alt, Control, Meta) and shortcuts", async () => {
    // Simulate Ctrl+A shortcut
    const ctrlDown = await dispatchBrowserAction(testAppId, { type: "keyDown", key: "Control" });
    assert.equal(ctrlDown.success, true);

    const aDown = await dispatchBrowserAction(testAppId, { type: "keyDown", key: "a" });
    assert.equal(aDown.success, true);

    const aUp = await dispatchBrowserAction(testAppId, { type: "keyUp", key: "a" });
    assert.equal(aUp.success, true);

    const ctrlUp = await dispatchBrowserAction(testAppId, { type: "keyUp", key: "Control" });
    assert.equal(ctrlUp.success, true);

    // Shift key
    const shiftDown = await dispatchBrowserAction(testAppId, { type: "keyDown", key: "Shift" });
    assert.equal(shiftDown.success, true);
    const shiftUp = await dispatchBrowserAction(testAppId, { type: "keyUp", key: "Shift" });
    assert.equal(shiftUp.success, true);
  });

  test("10. Safely releases any held inputs via releaseHeldInputs / resetInput", async () => {
    // Hold a key and mouse button
    await dispatchBrowserAction(testAppId, { type: "mouseDown", x: 100, y: 100, button: "left" });
    await dispatchBrowserAction(testAppId, { type: "keyDown", key: "Shift" });

    // Release via resetInput
    const resetRes = await dispatchBrowserAction(testAppId, { type: "resetInput" });
    assert.equal(resetRes.success, true);

    // Also explicit helper function
    await releaseHeldInputs(testAppId);
  });

  test("11. Returning control to AI releases held inputs and switches mode", async () => {
    const res = await returnControlService(testAppId, testUserId);
    assert.equal(res.success, true);
    assert.equal(res.controlMode, CONTROL_MODES.AI);
    assert.equal(session.controlMode, CONTROL_MODES.AI);
  });

  test("12. Frame retrieval contains only viewport metadata and no secret credentials", async () => {
    const frameData = getLatestBrowserFrame(testAppId);
    assert.ok(frameData.applicationId);
    assert.ok(frameData.frame);
    assert.equal(frameData.isLive, true);

    // Verify no secret credentials exposed
    assert.equal(frameData.cookies, undefined);
    assert.equal(frameData.storageState, undefined);
    assert.equal(frameData.token, undefined);
    assert.equal(frameData.password, undefined);
  });

  test("13. Handles invalid coordinates safely without crashing", async () => {
    session.controlMode = CONTROL_MODES.HUMAN;

    const resNaN = await dispatchBrowserAction(testAppId, {
      type: "click",
      x: NaN,
      y: "invalid",
      button: "left",
    });
    assert.equal(resNaN.success, true);

    const resOverflow = await dispatchBrowserAction(testAppId, {
      type: "mouseMove",
      x: 999999,
      y: -500,
    });
    assert.equal(resOverflow.success, true);
  });
});
