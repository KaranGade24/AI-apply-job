import { logJobEvent } from '../../utils/logger.js';

/**
 * LoopDetector keeps track of action history, page states, and URLs
 * to prevent repetitive loops or stuck states.
 */
export class LoopDetector {
  constructor() {
    this.actionHashes = [];
    this.history = [];
    this.stagnationCount = 0;
    this.lastUrl = null;
    this.lastElementSetHash = null;
  }

  /**
   * Computes a simple hash for an action.
   */
  getActionHash(action) {
    return `${action.type}_${action.index || ''}_${(action.text || '').substring(0, 20)}`;
  }

  /**
   * Computes a simple hash for a set of elements.
   */
  getElementSetHash(elements) {
    if (!elements || elements.length === 0) return 'empty';
    return elements.map(el => `${el.id}:${el.tag}:${el.inViewport}`).join('|');
  }

  /**
   * Record a step and check if we are in a loop or stagnation.
   * @returns {{ loopDetected: boolean, nudgeMessage: string|null, escalate: boolean }}
   */
  recordAndCheck(url, elements, action) {
    const actionHash = this.getActionHash(action);
    const elementHash = this.getElementSetHash(elements);

    // Track action rolling window of 20
    this.actionHashes.push(actionHash);
    if (this.actionHashes.length > 20) {
      this.actionHashes.shift();
    }

    // Check action repeats (same action repeated consecutively)
    let consecutiveSameActionCount = 0;
    for (let i = this.actionHashes.length - 1; i >= 0; i--) {
      if (this.actionHashes[i] === actionHash) {
        consecutiveSameActionCount++;
      } else {
        break;
      }
    }

    // Track page-stagnation (same URL + same elements set)
    if (this.lastUrl === url && this.lastElementSetHash === elementHash) {
      this.stagnationCount++;
    } else {
      this.stagnationCount = 0;
    }

    this.lastUrl = url;
    this.lastElementSetHash = elementHash;

    const result = {
      loopDetected: false,
      nudgeMessage: null,
      escalate: false
    };

    if (consecutiveSameActionCount >= 2) {
      result.loopDetected = true;
      result.nudgeMessage = `Warning: You have performed the identical action twice in a row: "${actionHash}". Please change your approach.`;
    }

    if (this.stagnationCount >= 3) {
      result.loopDetected = true;
      result.escalate = true;
      result.nudgeMessage = `Escalation: Page stagnation detected. The URL and elements have remained unchanged for 3 consecutive steps. Escalating to human.`;
    }

    return result;
  }
}

export default LoopDetector;
