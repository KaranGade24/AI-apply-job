import { BROWSER_ACTIONS } from '../../constant/application.constant.js';
import { logJobEvent, logError } from '../../utils/logger.js';

/**
 * High-reliability post-action verification system.
 * Validates the expectedOutcome by comparing before-state, action details, and after-state.
 *
 * @param {import('playwright').Page} page - Playwright page instance
 * @param {object} action - Action descriptor (containing expectedOutcome, type, target, value)
 * @param {object} previousObservation - Page observation before execution
 * @param {object} currentObservation - Page observation after execution
 * @param {object} executionResult - Direct result from browserExecutor
 * @returns {Promise<object>} Structured verification result
 */
export async function verifyStateTransition(
  page,
  action,
  previousObservation,
  currentObservation,
  executionResult
) {
  const { type: actionType, expectedOutcome, intent, target, value } = action;

  // Base response structure
  const result = {
    verified: false,
    verificationLevel: 'ELEMENT', // 'ELEMENT' | 'PAGE' | 'STRUCTURAL'
    expectedOutcome: expectedOutcome || 'unknown_outcome',
    actualOutcome: 'no_change',
    evidence: {},
    confidence: 0.0,
    reason: ''
  };

  // If the low-level execution failed outright, we cannot verify business success
  if (!executionResult || !executionResult.ok) {
    result.verified = false;
    result.reason = `Execution failed: ${executionResult?.error || 'unknown execution error'}`;
    result.confidence = 0.0;
    return result;
  }

  try {
    switch (actionType) {
      case BROWSER_ACTIONS.NAVIGATE: {
        result.verificationLevel = 'PAGE';
        const targetUrl = target?.url || value;
        const currentUrl = page.url();

        result.evidence = { expectedUrl: targetUrl, actualUrl: currentUrl };

        if (!targetUrl) {
          result.verified = false;
          result.reason = 'Navigation expected outcome cannot be verified because target URL was missing';
          result.confidence = 0.0;
          break;
        }

        // Hard rule: Do NOT accept generic startsWith("http")
        if (targetUrl === 'http' || targetUrl === 'https') {
          result.verified = false;
          result.reason = 'Weak verification rejected: target URL matches placeholder http prefix';
          result.confidence = 0.1;
          break;
        }

        const expectedHost = new URL(targetUrl).hostname.toLowerCase();
        const actualHost = new URL(currentUrl).hostname.toLowerCase();

        if (expectedHost === actualHost) {
          result.verified = true;
          result.actualOutcome = 'navigation_success';
          result.confidence = 1.0;
          result.reason = 'Navigation verified: Host domains match successfully';
        } else {
          result.verified = false;
          result.actualOutcome = 'navigation_mismatch';
          result.confidence = 0.2;
          result.reason = `Navigation mismatch: Expected hostname "${expectedHost}", but ended up on "${actualHost}"`;
        }
        break;
      }

      case BROWSER_ACTIONS.FILL:
      case BROWSER_ACTIONS.TYPE: {
        result.verificationLevel = 'ELEMENT';
        const expectedVal = String(value ?? '').trim();
        
        // Find matching input in the live page to retrieve its actual typed value
        let actualVal = '';
        if (target?.elementId || target?.elementFingerprint || target?.selector) {
          const sel = target.selector || (target.elementId ? `#${target.elementId}` : `[data-testid="${target.elementFingerprint}"]`);
          actualVal = await page.locator(sel).first().inputValue().catch(() => '');
        }

        const valueMatches = actualVal.trim() === expectedVal;
        result.evidence = { expectedValue: expectedVal, actualValue: actualVal };

        if (valueMatches) {
          result.verified = true;
          result.actualOutcome = 'field_value_matches';
          result.confidence = 1.0;
          result.reason = 'Field input value fully verified against desired text';
        } else {
          result.verified = false;
          result.actualOutcome = 'field_value_mismatch';
          result.confidence = 0.0;
          result.reason = `Value verification failed: expected "${expectedVal}", but field contains "${actualVal}"`;
        }
        break;
      }

      case BROWSER_ACTIONS.CHECK:
      case BROWSER_ACTIONS.UNCHECK: {
        result.verificationLevel = 'ELEMENT';
        const expectedChecked = actionType === BROWSER_ACTIONS.CHECK;
        
        let actualChecked = false;
        if (target?.elementId || target?.elementFingerprint || target?.selector) {
          const sel = target.selector || (target.elementId ? `#${target.elementId}` : `[data-testid="${target.elementFingerprint}"]`);
          actualChecked = await page.locator(sel).first().isChecked().catch(() => false);
        }

        result.evidence = { expectedChecked, actualChecked };

        if (actualChecked === expectedChecked) {
          result.verified = true;
          result.actualOutcome = 'checkbox_state_matches';
          result.confidence = 1.0;
          result.reason = `Checkbox matches desired state: ${expectedChecked}`;
        } else {
          result.verified = false;
          result.actualOutcome = 'checkbox_state_mismatch';
          result.confidence = 0.0;
          result.reason = `Checkbox state mismatch: expected checked=${expectedChecked}, actual=${actualChecked}`;
        }
        break;
      }

      case BROWSER_ACTIONS.SELECT: {
        result.verificationLevel = 'ELEMENT';
        const expectedVal = String(value ?? '').trim().toLowerCase();

        let actualVal = '';
        let actualLabel = '';
        if (target?.elementId || target?.elementFingerprint || target?.selector) {
          const sel = target.selector || (target.elementId ? `#${target.elementId}` : `[data-testid="${target.elementFingerprint}"]`);
          actualVal = await page.locator(sel).first().inputValue().catch(() => '');
          
          // Try to get selected option label
          actualLabel = await page.locator(sel).first().evaluate(el => {
            const opt = el.options?.[el.selectedIndex];
            return opt ? opt.text : '';
          }).catch(() => '');
        }

        const labelMatch = actualLabel.trim().toLowerCase() === expectedVal;
        const valMatch = actualVal.trim().toLowerCase() === expectedVal;
        const matched = labelMatch || valMatch;

        result.evidence = { expectedSelection: expectedVal, actualValue: actualVal, actualLabel };

        if (matched) {
          result.verified = true;
          result.actualOutcome = 'selected_value_matches';
          result.confidence = 1.0;
          result.reason = 'Select option selection verified successfully';
        } else {
          result.verified = false;
          result.actualOutcome = 'selected_value_mismatch';
          result.confidence = 0.0;
          result.reason = `Select option mismatch: expected selection containing "${expectedVal}", found val="${actualVal}" label="${actualLabel}"`;
        }
        break;
      }

      case BROWSER_ACTIONS.UPLOAD: {
        result.verificationLevel = 'ELEMENT';
        const expectedFile = String(value ?? '').split(/[/\\]/).pop();

        let inputFiles = [];
        if (target?.elementId || target?.elementFingerprint || target?.selector) {
          const sel = target.selector || (target.elementId ? `#${target.elementId}` : `[data-testid="${target.elementFingerprint}"]`);
          inputFiles = await page.locator(sel).first().evaluate(el => {
            return el.files ? Array.from(el.files).map(f => f.name) : [];
          }).catch(() => []);
        }

        // Also check if some successful upload indicator is present in the document
        const pageText = await page.textContent('body').catch(() => '');
        const textIndicatesSuccess = expectedFile && pageText.toLowerCase().includes(expectedFile.toLowerCase());

        const fileMatches = inputFiles.some(f => expectedFile && f.toLowerCase().includes(expectedFile.toLowerCase()));
        const isVerified = fileMatches || textIndicatesSuccess;

        result.evidence = { expectedFile, inputFiles, textIndicatesSuccess };

        if (isVerified) {
          result.verified = true;
          result.actualOutcome = 'upload_verified';
          result.confidence = 0.9;
          result.reason = 'File upload confirmed: file name matched input array or visual success text indicator';
        } else {
          result.verified = false;
          result.actualOutcome = 'upload_failed';
          result.confidence = 0.1;
          result.reason = `File upload not represented: could not confirm "${expectedFile}" inside input elements or on-page text`;
        }
        break;
      }

      case BROWSER_ACTIONS.CLICK: {
        result.verificationLevel = 'STRUCTURAL';

        // Check if modal popped open or closed
        const wasModalOpen = previousObservation?.modalOpen === true;
        const isModalOpen = currentObservation?.modalOpen === true;
        const modalOpened = !wasModalOpen && isModalOpen;
        const modalClosed = wasModalOpen && !isModalOpen;

        // Check if URL transitioned
        const prevUrl = previousObservation?.url || '';
        const curUrl = currentObservation?.url || '';
        const urlTransitioned = prevUrl !== curUrl && curUrl !== '';

        // Check for common error banners or field validation messages
        const pageText = await page.textContent('body').catch(() => '');
        const hasFormErrors = /required|error|invalid|cannot be blank/i.test(pageText) && !/required.*success/i.test(pageText);

        result.evidence = { modalOpened, modalClosed, urlTransitioned, hasFormErrors, prevUrl, curUrl };

        if (expectedOutcome === 'application_entry') {
          const matchedGate = /apply|application|candidate|submit/i.test(curUrl) || modalOpened;
          if (matchedGate) {
            result.verified = true;
            result.actualOutcome = 'application_entry';
            result.confidence = 0.9;
            result.reason = 'Click Apply verified: application portal entered or submission modal appeared';
          } else {
            result.verified = false;
            result.actualOutcome = 'click_did_not_open_portal';
            result.confidence = 0.2;
            result.reason = 'Click Apply failed: did not trigger modal opening or transition to known gateway';
          }
        } 
        else if (expectedOutcome === 'next_step' || expectedOutcome === 'next_step OR validation_error') {
          if (urlTransitioned || modalClosed || (!hasFormErrors && !modalOpened)) {
            result.verified = true;
            result.actualOutcome = 'next_step';
            result.confidence = 0.8;
            result.reason = 'Click Continue verified: transitioned safely to next step';
          } else if (hasFormErrors) {
            result.verified = true;
            result.actualOutcome = 'validation_error';
            result.confidence = 0.8;
            result.reason = 'Click Continue handled: correct form validation rules intercepted navigation';
          } else {
            result.verified = false;
            result.actualOutcome = 'click_stuck';
            result.confidence = 0.1;
            result.reason = 'Click Continue failed: page state remains static without advancing or showing validation errors';
          }
        }
        else if (expectedOutcome === 'submission_confirmation') {
          const successDetected = /thank you|received|submitted|success/i.test(pageText);
          if (successDetected) {
            result.verified = true;
            result.actualOutcome = 'submission_confirmation';
            result.confidence = 1.0;
            result.reason = 'Click Submit verified: detected clear success confirmation text';
          } else {
            result.verified = false;
            result.actualOutcome = 'submission_missing_success_indicator';
            result.confidence = 0.1;
            result.reason = 'Click Submit failed: no success message/receipt was found on the post-click screen';
          }
        }
        else {
          // General fallback for click outcomes
          const changed = urlTransitioned || modalOpened || modalClosed;
          if (changed) {
            result.verified = true;
            result.actualOutcome = expectedOutcome;
            result.confidence = 0.7;
            result.reason = 'Action verified: structural UI transition detected';
          } else {
            result.verified = false;
            result.actualOutcome = 'no_change';
            result.confidence = 0.1;
            result.reason = 'Action verification failed: layout remained entirely static';
          }
        }
        break;
      }

      default:
        // Passive items (WAIT, SCROLL) are verified by baseline execution success
        result.verified = true;
        result.actualOutcome = expectedOutcome;
        result.confidence = 0.8;
        result.reason = `Passive action verified by execution success`;
        break;
    }

    return result;
  } catch (error) {
    await logError('stateVerifier.verifyStateTransition', error.message);
    result.verified = false;
    result.reason = `Verification exception: ${error.message}`;
    result.confidence = 0.0;
    return result;
  }
}
