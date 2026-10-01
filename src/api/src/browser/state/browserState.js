import { getDomSnapshot } from '../dom/domService.js';
import { getSession } from '../session/sessionRegistry.js';

/**
 * Checks if a given text or attribute indicates a pagination/next page element.
 */
export const isPaginationNext = (el) => {
  const text = (el.accessibleName || '').toLowerCase();
  const rel = (el.attributes?.rel || '').toLowerCase();
  const ariaLabel = (el.ariaLabel || '').toLowerCase();
  
  if (rel === 'next' || el.href === '#next') return true;
  if (/next\s*page|>\s*$|→|»|next\s*>/i.test(text)) return true;
  if (/(?:^|\s)next(?:$|\s)/i.test(text) || /(?:^|\s)next(?:$|\s)/i.test(ariaLabel)) {
    return true;
  }
  return false;
};

/**
 * Aggregates complete browser state into a single cohesive BrowserState object.
 * @param {import('playwright').Page} page
 * @param {string} applicationId
 * @returns {Promise<object>} Combined BrowserState object
 */
export const getBrowserState = async (page, applicationId) => {
  try {
    const session = getSession(applicationId) || { tabs: [], dialogs: [], redirectReports: [], downloads: [] };
    const snapshot = await getDomSnapshot(page);

    const url = page.url();
    const title = snapshot.title || '';

    // 1. Detect Captcha Signals
    let hasCaptchaSignals = false;
    const captchaKeywords = ['captcha', 'recaptcha', 'hcaptcha', 'turnstile', 'arkose', 'botdetect', 'challenge-form'];
    if (captchaKeywords.some(keyword => url.toLowerCase().includes(keyword))) {
      hasCaptchaSignals = true;
    }
    if (!hasCaptchaSignals) {
      hasCaptchaSignals = snapshot.elements.some(el => {
        const text = (el.accessibleName || '').toLowerCase();
        const id = (el.id || '').toLowerCase();
        const tag = (el.tag || '').toLowerCase();
        return captchaKeywords.some(keyword => text.includes(keyword) || id.includes(keyword) || tag.includes(keyword));
      });
    }

    // 2. Detect Login Signals
    let hasLoginSignals = snapshot.elements.some(el => {
      const isPasswordInput = el.tag === 'input' && el.type === 'password';
      const text = (el.accessibleName || '').toLowerCase();
      const isLoginTrigger = /log\s*in|sign\s*in|login|signin/i.test(text);
      return isPasswordInput || isLoginTrigger;
    });

    // 2.5 Detect Sensitive Fields & Sanitize elements
    let hasSensitiveSignals = false;
    let sensitiveReason = '';
    
    const sanitizedElements = snapshot.elements.map(el => {
      const copy = { ...el };
      const type = (copy.type || '').toLowerCase();
      const name = (copy.name || '').toLowerCase();
      const id = (copy.id || '').toLowerCase();
      const text = (copy.accessibleName || '').toLowerCase();

      const isSensitive = 
        type === 'password' ||
        /password|passcode|otp|one-time|verification.*code|two-factor|mfa|2fa|cookie|token/i.test(name) ||
        /password|passcode|otp|one-time|verification.*code|two-factor|mfa|2fa|cookie|token/i.test(id) ||
        /password|passcode|otp|one-time|verification.*code|two-factor|mfa|2fa|cookie|token/i.test(text);

      if (isSensitive) {
        hasSensitiveSignals = true;
        sensitiveReason = `Sensitive input field related to ${type || 'credential'} detected: "${copy.accessibleName || copy.name || copy.id}"`;
      }

      if (copy.value) {
        if (isSensitive) {
          copy.value = '[SENSITIVE_REDACTED]';
        } else {
          copy.value = '[FILLED_REDACTED]';
        }
      }
      return copy;
    });

    // 3. Detect Pagination/Next buttons
    const paginationButtons = snapshot.elements
      .filter(isPaginationNext)
      .map(el => ({
        id: el.id,
        tag: el.tag,
        accessibleName: el.accessibleName,
        boundingBox: el.boundingBox
      }));

    // 4. Check PDF
    const isPdf = url.toLowerCase().endsWith('.pdf') || page.url().startsWith('chrome-extension://');

    // 5. Aggregate tabs list
    const tabs = session.tabs.map(t => ({
      id: t.id,
      url: t.url,
      title: t.title,
      isActive: t.id === session.activeTabId
    }));

    const browserState = {
      url,
      title,
      tabs,
      activeTabId: session.activeTabId,
      pageInfo: {
        scroll: snapshot.scroll,
        pixelsAbove: snapshot.scroll.pixelsAbove,
        pixelsBelow: snapshot.scroll.pixelsBelow
      },
      elements: sanitizedElements,
      pendingRequests: 0, // Simplified network tracking
      closedDialogMessages: session.dialogs || [],
      paginationButtons,
      errors: snapshot.error ? [snapshot.error] : [],
      frames: snapshot.frames,
      isPdf,
      hasCaptchaSignals,
      hasLoginSignals,
      hasSensitiveSignals,
      sensitiveReason,
      timestamp: Date.now()
    };

    return browserState;
  } catch (error) {
    return {
      url: page ? page.url() : '',
      title: 'Error State',
      tabs: [],
      activeTabId: null,
      pageInfo: { scroll: { x: 0, y: 0, pixelsAbove: 0, pixelsBelow: 0, height: 0 }, pixelsAbove: 0, pixelsBelow: 0 },
      elements: [],
      pendingRequests: 0,
      closedDialogMessages: [],
      paginationButtons: [],
      errors: [error.message],
      frames: [],
      isPdf: false,
      hasCaptchaSignals: false,
      hasLoginSignals: false,
      hasSensitiveSignals: false,
      sensitiveReason: '',
      timestamp: Date.now()
    };
  }
};

export default {
  getBrowserState,
  isPaginationNext
};
